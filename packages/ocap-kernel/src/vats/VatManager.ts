import type { CapData } from '@endo/marshal';
import {
  VatAlreadyExistsError,
  VatDeletedError,
  VatNotFoundError,
} from '@metamask/kernel-errors';
import { stringify } from '@metamask/kernel-utils';
import { Logger, splitLoggerStream } from '@metamask/logger';

import type { KernelQueue } from '../KernelQueue.ts';
import { makeKernelError } from '../liveslots/kernel-marshal.ts';
import type { KernelStore } from '../store/index.ts';
import type {
  VatId,
  VatConfig,
  KRef,
  SubclusterId,
  PlatformServices,
} from '../types.ts';
import { ROOT_OBJECT_VREF } from '../types.ts';
import type { AllowedGlobalName } from './endowments.ts';
import { VatHandle } from './VatHandle.ts';
import type { PingVatResult } from '../rpc/index.ts';

/**
 * Describe where a vat's code comes from, for diagnostics. A vat that cannot be
 * restored is almost always a vat whose code has become unreachable, so the
 * spec that names that code is the actionable part of the report.
 *
 * @param vatConfig - The vat's configuration.
 * @returns A human-readable description of the vat's code source.
 */
function describeVatSource(vatConfig: VatConfig): string {
  if ('bundleSpec' in vatConfig) {
    return `bundleSpec ${vatConfig.bundleSpec}`;
  }
  if ('sourceSpec' in vatConfig) {
    return `sourceSpec ${vatConfig.sourceSpec}`;
  }
  return `bundleName ${vatConfig.bundleName}`;
}

type VatManagerOptions = {
  platformServices: PlatformServices;
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  logger?: Logger;
  allowedGlobalNames?: AllowedGlobalName[] | undefined;
};

/**
 * Manages vat lifecycle operations including creation, termination, and restart.
 */
export class VatManager {
  /** Currently running vats, by ID */
  readonly #vats: Map<VatId, VatHandle>;

  /** Service to spawn workers (in iframes) for vats to run in */
  readonly #platformServices: PlatformServices;

  /** Storage holding the kernel's persistent state */
  readonly #kernelStore: KernelStore;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger;

  /** Optional list of allowed global names for vat endowments */
  readonly #allowedGlobalNames: AllowedGlobalName[] | undefined;

  /**
   * Creates a new VatManager instance.
   *
   * @param options - Constructor options.
   * @param options.platformServices - Platform-specific services for launching vat workers.
   * @param options.kernelStore - The kernel's persistent state store.
   * @param options.kernelQueue - The kernel's message queue for scheduling deliveries.
   * @param options.logger - Logger instance for debugging and diagnostics.
   * @param options.allowedGlobalNames - Optional list of allowed global names for vat endowments.
   */
  constructor({
    platformServices,
    kernelStore,
    kernelQueue,
    logger,
    allowedGlobalNames,
  }: VatManagerOptions) {
    this.#vats = new Map();
    this.#platformServices = platformServices;
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#logger = logger ?? new Logger('VatManager');
    this.#allowedGlobalNames = allowedGlobalNames;
    harden(this);
  }

  /**
   * Initialize all vats that were previously running.
   * This should be called during kernel startup.
   *
   * @returns A promise that resolves when all vats are initialized.
   */
  async initializeAllVats(): Promise<void> {
    const starts: Promise<void>[] = [];
    for (const { vatID, vatConfig } of this.#kernelStore.getAllVatRecords()) {
      starts.push(this.#restoreVat(vatID, vatConfig));
    }
    await Promise.all(starts);
  }

  /**
   * Restore one persisted vat, tolerating a vat that can no longer be run.
   *
   * A vat outlives the code it was launched from: a bundle can be rebuilt to a
   * new path, pruned, or recorded as an absolute path that did not survive
   * relocation. Restoring every vat in one `Promise.all` made a single such vat
   * reject the whole boot, so one unreachable bundle left the entire kernel —
   * every other subcluster included — unbootable. Here the failure is confined
   * to the vat that owns it: the vat is skipped and the rest of the kernel comes
   * up.
   *
   * The vat's persisted record is kept, not pruned, so a vat whose code becomes
   * reachable again is restored by a later boot. Whether an unrestorable vat
   * should instead take its subcluster down with it is a lifecycle-policy
   * question (see #979); this method only declines to lose the healthy vats.
   *
   * @param vatId - The ID of the vat to restore.
   * @param vatConfig - Its configuration.
   */
  async #restoreVat(vatId: VatId, vatConfig: VatConfig): Promise<void> {
    try {
      await this.runVat(vatId, vatConfig);
    } catch (error) {
      // The worker may well be alive even though the vat is not: `runVat`
      // reaches `VatHandle.make` only once `launch` has resolved, and it is the
      // `initVat` delivery inside `make` that fails when a vat's code cannot be
      // loaded. A worker left running that way is the wedged process this whole
      // failure mode is known by, so reap it before moving on. Failure to
      // terminate is expected when `launch` itself was what failed — there is no
      // worker to reap — so it is reported at debug level only.
      await this.#platformServices.terminate(vatId).catch((terminateError) => {
        this.#logger.debug(
          `No worker to reap for unrestorable vat ${vatId}`,
          terminateError,
        );
      });
      // `getVatSubcluster` fails rather than returning undefined for a vat with
      // no subcluster, and a diagnostic is no place to acquire a second way to
      // fail.
      let subclusterId: SubclusterId | 'none';
      try {
        subclusterId = this.#kernelStore.getVatSubcluster(vatId);
      } catch {
        subclusterId = 'none';
      }
      this.#logger.error(
        `Cannot restore vat ${vatId} of subcluster ${subclusterId} (${describeVatSource(vatConfig)}); skipping it. Its state is retained, so it returns if its code becomes reachable again.`,
        error,
      );
    }
  }

  /**
   * Launch a new vat.
   *
   * @param vatConfig - Configuration for the new vat.
   * @param vatName - The name of the vat within the subcluster.
   * @param subclusterId - The ID of the subcluster to launch the vat in. Optional.
   * @returns a promise for the KRef of the new vat's root object.
   */
  async launchVat(
    vatConfig: VatConfig,
    vatName: string,
    subclusterId?: SubclusterId,
  ): Promise<KRef> {
    const vatId = this.#kernelStore.getNextVatId();
    // Register the vat with its subcluster BEFORE awaiting `runVat`.
    // `runVat` yields to the kernel event loop (loading the bundle,
    // negotiating with the vat worker); any crank that runs during that
    // window ends with `collectGarbage()` → `clearEmptySubclusters()`,
    // which would otherwise delete the just-created, still-empty
    // subcluster out from under us. Associating the vat first makes the
    // subcluster non-empty for GC.
    if (subclusterId) {
      this.#kernelStore.addSubclusterVat(subclusterId, vatName, vatId);
    }
    try {
      await this.runVat(vatId, vatConfig);
    } catch (error) {
      // Attribute the failure to the specific vat by kernel id and name.
      throw new Error(`Failed to launch vat ${vatId} (${vatName})`, {
        cause: error,
      });
    }
    this.#kernelStore.initEndpoint(vatId);
    const rootRef = this.#kernelStore.exportFromEndpoint(
      vatId,
      ROOT_OBJECT_VREF,
    );
    this.#kernelStore.setVatConfig(vatId, vatConfig);
    return rootRef;
  }

  /**
   * Start a new or resurrected vat running.
   *
   * @param vatId - The ID of the vat to start.
   * @param vatConfig - Its configuration.
   */
  async runVat(vatId: VatId, vatConfig: VatConfig): Promise<void> {
    if (this.#vats.has(vatId)) {
      throw new VatAlreadyExistsError(vatId);
    }
    const stream = await this.#platformServices.launch(vatId, vatConfig);
    const { kernelStream: vatStream, loggerStream } = splitLoggerStream(stream);
    const vatLogger = this.#logger.subLogger({ tags: [vatId] });
    vatLogger.injectStream(
      loggerStream as unknown as Parameters<typeof vatLogger.injectStream>[0],
      (error) => this.#logger.error(`Vat ${vatId} error: ${stringify(error)}`),
    );
    const vat = await VatHandle.make({
      vatId,
      vatConfig,
      vatStream,
      kernelStore: this.#kernelStore,
      kernelQueue: this.#kernelQueue,
      logger: vatLogger,
      allowedGlobalNames: this.#allowedGlobalNames,
    });
    this.#vats.set(vatId, vat);
  }

  /**
   * Stop a vat from running.
   *
   * Note that after this operation, the vat will be in a weird twilight zone
   * between existence and nonexistence, so this operation should only be used
   * as a component of vat restart (which will push it back into existence) or
   * vat termination (which will push it all the way into nonexistence).
   *
   * @param vatId - The ID of the vat.
   * @param terminating - If true, the vat is being killed, if false, it's being
   *   restarted.
   * @param reason - If the vat is being terminated, the reason for the termination.
   */
  async stopVat(
    vatId: VatId,
    terminating: boolean,
    reason?: CapData<KRef>,
  ): Promise<void> {
    const vat = this.getVat(vatId);
    let terminationError: Error | undefined;
    if (reason) {
      terminationError = new Error(`Vat termination: ${reason.body}`);
    } else if (terminating) {
      terminationError = new VatDeletedError(vatId);
    }
    await this.#platformServices
      .terminate(vatId, terminationError)
      .catch(this.#logger.error);
    await vat.terminate(terminating, terminationError);
    this.#vats.delete(vatId);
  }

  /**
   * Retire a persisted vat that is not running.
   *
   * A vat skipped at boot because its code could not be loaded (`#restoreVat`)
   * has no worker to stop, so it never reaches `VatHandle.terminate` — which is
   * where a running vat's records are discarded and the promises it was
   * deciding are rejected. Neither has anyone else to do it: the deferred
   * `cleanupTerminatedVat` states outright that its caller has already rejected
   * those promises, and it walks keys prefixed `${vatId}.`, which never matches
   * the `vatConfig.${vatId}` that decides whether the next boot restores this
   * vat. Left to `markVatAsTerminated` alone, terminating such a vat neither
   * retires it nor releases anything waiting on it.
   *
   * @param vatId - The ID of the vat.
   * @param reason - The reason for the termination, if any.
   */
  #retirePersistedVat(vatId: VatId, reason?: CapData<KRef>): void {
    const terminationError = reason
      ? new Error(`Vat termination: ${reason.body}`)
      : new VatDeletedError(vatId);
    const failure = makeKernelError('VAT_TERMINATED', terminationError.message);
    for (const kpid of this.#kernelStore.getPromisesByDecider(vatId)) {
      this.#kernelQueue.resolvePromises(vatId, [[kpid, true, failure]]);
    }
    this.#kernelStore.deleteVat(vatId);
  }

  /**
   * Terminate a vat with extreme prejudice.
   *
   * Terminates a persisted vat that is not running as readily as one that is.
   * A vat skipped at boot because its code could not be loaded (`#restoreVat`)
   * has no worker to stop, but its records must still be retirable — otherwise
   * the only way to be rid of one would be to discard the whole store, and
   * `SubclusterManager.terminateSubcluster`, which walks persisted membership,
   * would strand every subcluster containing one.
   *
   * @param vatId - The ID of the vat.
   * @param reason - If the vat is being terminated, the reason for the termination.
   */
  async terminateVat(vatId: VatId, reason?: CapData<KRef>): Promise<void> {
    await this.#kernelQueue.waitForCrank();
    if (this.hasVat(vatId)) {
      await this.stopVat(vatId, true, reason);
    } else if (this.#kernelStore.isVatActive(vatId)) {
      this.#retirePersistedVat(vatId, reason);
    } else {
      // Not running *and* not persisted: this vat is simply unknown, and
      // saying so beats silently retiring records that were never there.
      throw new VatNotFoundError(vatId);
    }
    // Mark for deletion (which will happen later, in vat-cleanup events)
    this.#kernelStore.markVatAsTerminated(vatId);
  }

  /**
   * Restarts a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns A promise for the restarted vat.
   */
  async restartVat(vatId: VatId): Promise<VatHandle> {
    await this.#kernelQueue.waitForCrank();
    const vat = this.getVat(vatId);
    const { config } = vat;
    await this.stopVat(vatId, false);
    await this.runVat(vatId, config);
    return this.getVat(vatId);
  }

  /**
   * Ping a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns A promise that resolves to the result of the ping.
   */
  async pingVat(vatId: VatId): Promise<PingVatResult> {
    const vat = this.getVat(vatId);
    return vat.ping();
  }

  /**
   * Get a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns the vat's VatHandle.
   */
  getVat(vatId: VatId): VatHandle {
    const vat = this.#vats.get(vatId);
    if (vat === undefined) {
      throw new VatNotFoundError(vatId);
    }
    return vat;
  }

  /**
   * Check if a vat exists.
   *
   * @param vatId - The ID of the vat.
   * @returns true if the vat exists, false otherwise.
   */
  hasVat(vatId: VatId): boolean {
    return this.#vats.has(vatId);
  }

  /**
   * Gets a list of the IDs of all running vats.
   *
   * @returns An array of vat IDs.
   */
  getVatIds(): VatId[] {
    return Array.from(this.#vats.keys());
  }

  /**
   * Gets a list of information about all running vats.
   *
   * @returns An array of vat information records.
   */
  getVats(): {
    id: VatId;
    config: VatConfig;
    subclusterId: SubclusterId;
  }[] {
    return Array.from(this.#vats.values()).map((vat) => {
      const subclusterId = this.#kernelStore.getVatSubcluster(vat.vatId);
      return {
        id: vat.vatId,
        config: vat.config,
        subclusterId,
      };
    });
  }

  /**
   * Pin a vat root.
   *
   * @param vatId - The ID of the vat.
   * @returns The KRef of the vat root.
   */
  pinVatRoot(vatId: VatId): KRef {
    const kref = this.#kernelStore.getRootObject(vatId);
    if (!kref) {
      throw new VatNotFoundError(vatId);
    }
    this.#kernelStore.pinObject(kref);
    return kref;
  }

  /**
   * Unpin a vat root.
   *
   * @param vatId - The ID of the vat.
   */
  unpinVatRoot(vatId: VatId): void {
    const kref = this.#kernelStore.getRootObject(vatId);
    if (!kref) {
      throw new VatNotFoundError(vatId);
    }
    this.#kernelStore.unpinObject(kref);
  }

  /**
   * Reap vats that match the filter.
   *
   * @param filter - A function that returns true if the vat should be reaped.
   */
  reapVats(filter: (vatId: VatId) => boolean = () => true): void {
    for (const vatID of this.getVatIds()) {
      if (filter(vatID)) {
        this.#kernelStore.scheduleReap(vatID);
      }
    }
  }

  /**
   * Terminate all vats and collect garbage.
   * This is for debugging purposes only.
   */
  async terminateAllVats(): Promise<void> {
    await this.#kernelQueue.waitForCrank();
    for (const id of this.getVatIds().reverse()) {
      await this.terminateVat(id);
      this.collectGarbage();
    }
  }

  /**
   * Collect garbage.
   * This is for debugging purposes only.
   */
  collectGarbage(): void {
    while (this.#kernelStore.nextTerminatedVatCleanup()) {
      // wait for all vats to be cleaned up
    }
    this.#kernelStore.collectGarbage();
  }
}
harden(VatManager);
