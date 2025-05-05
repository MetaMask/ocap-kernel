import type { CapData } from '@endo/marshal';
import {
  StreamReadError,
  VatAlreadyExistsError,
  VatNotFoundError,
} from '@metamask/kernel-errors';
import { RpcService } from '@metamask/kernel-rpc-methods';
import type { KernelDatabase } from '@metamask/kernel-store';
import { stringify } from '@metamask/kernel-utils';
import type { JsonRpcCall } from '@metamask/kernel-utils';
import { Logger, splitLoggerStream } from '@metamask/logger';
import { serializeError } from '@metamask/rpc-errors';
import type { DuplexStream } from '@metamask/streams';
import { hasProperty } from '@metamask/utils';
import type { JsonRpcResponse } from '@metamask/utils';

import { KernelQueue } from './KernelQueue.ts';
import { KernelRouter } from './KernelRouter.ts';
import { kernelHandlers } from './rpc/index.ts';
import type { PingVatResult } from './rpc/index.ts';
import type { SlotValue } from './services/kernel-marshal.ts';
import { kslot } from './services/kernel-marshal.ts';
import { makeKernelStore } from './store/index.ts';
import type { KernelStore } from './store/index.ts';
import type {
  VatId,
  KRef,
  VatWorkerManager,
  ClusterConfig,
  VatConfig,
} from './types.ts';
import { ROOT_OBJECT_VREF, isClusterConfig } from './types.ts';
import { Fail } from './utils/assert.ts';
import { VatHandle } from './VatHandle.ts';

export class Kernel {
  /** Command channel from the controlling console/browser extension/test driver */
  readonly #commandStream: DuplexStream<JsonRpcCall, JsonRpcResponse>;

  readonly #rpcService: RpcService<typeof kernelHandlers>;

  /** Currently running vats, by ID */
  readonly #vats: Map<VatId, VatHandle>;

  /** Service to spawn workers (in iframes) for vats to run in */
  readonly #vatWorkerService: VatWorkerManager;

  /** Storage holding the kernel's own persistent state */
  readonly #kernelStore: KernelStore;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger;

  /** Configuration of the most recently launched vat subcluster (for debug purposes) */
  #mostRecentSubcluster: ClusterConfig | null;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** The kernel's router */
  readonly #kernelRouter: KernelRouter;

  /**
   * Construct a new kernel instance.
   *
   * @param commandStream - Command channel from whatever external software is driving the kernel.
   * @param vatWorkerService - Service to create a worker in which a new vat can run.
   * @param kernelDatabase - Database holding the kernel's persistent state.
   * @param options - Options for the kernel constructor.
   * @param options.resetStorage - If true, the storage will be cleared.
   * @param options.logger - Optional logger for error and diagnostic output.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor(
    commandStream: DuplexStream<JsonRpcCall, JsonRpcResponse>,
    vatWorkerService: VatWorkerManager,
    kernelDatabase: KernelDatabase,
    options: {
      resetStorage?: boolean;
      logger?: Logger;
    } = {},
  ) {
    this.#mostRecentSubcluster = null;
    this.#commandStream = commandStream;
    this.#rpcService = new RpcService(kernelHandlers, {});
    this.#vats = new Map();
    this.#vatWorkerService = vatWorkerService;
    this.#logger = options.logger ?? new Logger('ocap-kernel');
    this.#kernelStore = makeKernelStore(kernelDatabase);
    if (options.resetStorage) {
      this.#resetKernelState();
    }
    this.#kernelQueue = new KernelQueue(this.#kernelStore);
    this.#kernelRouter = new KernelRouter(
      this.#kernelStore,
      this.#kernelQueue,
      this.#getVat.bind(this),
    );
    harden(this);
  }

  /**
   * Create a new kernel instance.
   *
   * @param commandStream - Command channel from whatever external software is driving the kernel.
   * @param vatWorkerService - Service to create a worker in which a new vat can run.
   * @param kernelDatabase - Database holding the kernel's persistent state.
   * @param options - Options for the kernel constructor.
   * @param options.resetStorage - If true, the storage will be cleared.
   * @param options.logger - Optional logger for error and diagnostic output.
   * @returns A promise for the new kernel instance.
   */
  static async make(
    commandStream: DuplexStream<JsonRpcCall, JsonRpcResponse>,
    vatWorkerService: VatWorkerManager,
    kernelDatabase: KernelDatabase,
    options: {
      resetStorage?: boolean;
      logger?: Logger;
    } = {},
  ): Promise<Kernel> {
    const kernel = new Kernel(
      commandStream,
      vatWorkerService,
      kernelDatabase,
      options,
    );
    await kernel.#init();
    return kernel;
  }

  /**
   * Start the kernel running. Sets it up to actually receive command messages
   * and then begin processing the run queue.
   */
  async #init(): Promise<void> {
    this.#commandStream
      .drain(this.#handleCommandMessage.bind(this))
      .catch((error) => {
        this.#logger.error('Stream read error:', error);
        throw new StreamReadError({ kernelId: 'kernel' }, error);
      });
    const starts: Promise<void>[] = [];
    for (const { vatID, vatConfig } of this.#kernelStore.getAllVatRecords()) {
      starts.push(this.#runVat(vatID, vatConfig));
    }
    await Promise.all(starts);
    this.#kernelQueue
      .run(this.#kernelRouter.deliver.bind(this.#kernelRouter))
      .catch((error) => {
        this.#logger.error('Run loop error:', error);
        throw error;
      });
  }

  /**
   * Handle messages received over the command channel.
   *
   * @param message - The message to handle.
   */
  async #handleCommandMessage(message: JsonRpcCall): Promise<void> {
    try {
      this.#rpcService.assertHasMethod(message.method);
      const result = await this.#rpcService.execute(
        message.method,
        message.params,
      );
      if (hasProperty(message, 'id') && typeof message.id === 'string') {
        await this.#commandStream.write({
          id: message.id,
          jsonrpc: '2.0',
          result,
        });
      }
    } catch (error) {
      this.#logger.error('Error executing command', error);
      if (hasProperty(message, 'id') && typeof message.id === 'string') {
        await this.#commandStream.write({
          id: message.id,
          jsonrpc: '2.0',
          error: serializeError(error),
        });
      }
    }
  }

  /**
   * Launches a new vat.
   *
   * @param vatConfig - Configuration for the new vat.
   *
   * @returns a promise for the KRef of the new vat's root object.
   */
  async launchVat(vatConfig: VatConfig): Promise<KRef> {
    const vatId = this.#kernelStore.getNextVatId();
    await this.#runVat(vatId, vatConfig);
    this.#kernelStore.initEndpoint(vatId);
    const rootRef = this.#kernelStore.exportFromVat(vatId, ROOT_OBJECT_VREF);
    this.#kernelStore.setVatConfig(vatId, vatConfig);
    return rootRef;
  }

  /**
   * Start a new or resurrected vat running.
   *
   * @param vatId - The ID of the vat to start.
   * @param vatConfig - Its configuration.
   */
  async #runVat(vatId: VatId, vatConfig: VatConfig): Promise<void> {
    if (this.#vats.has(vatId)) {
      throw new VatAlreadyExistsError(vatId);
    }
    const stream = await this.#vatWorkerService.launch(vatId, vatConfig);
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
    });
    this.#vats.set(vatId, vat);
  }

  /**
   * Send a message from the kernel to an object in a vat.
   *
   * @param target - The object to which the message is directed.
   * @param method - The method to be invoked.
   * @param args - Message arguments.
   *
   * @returns a promise for the (CapData encoded) result of the message invocation.
   */
  async queueMessage(
    target: KRef,
    method: string,
    args: unknown[],
  ): Promise<CapData<KRef>> {
    return this.#kernelQueue.enqueueMessage(target, method, args);
  }

  /**
   * Launches a sub-cluster of vats.
   *
   * @param config - Configuration object for sub-cluster.
   * @returns a promise for the (CapData encoded) result of the bootstrap message.
   */
  async launchSubcluster(
    config: ClusterConfig,
  ): Promise<CapData<KRef> | undefined> {
    isClusterConfig(config) || Fail`invalid cluster config`;
    if (!config.vats[config.bootstrap]) {
      Fail`invalid bootstrap vat name ${config.bootstrap}`;
    }
    this.#mostRecentSubcluster = config;
    const rootIds: Record<string, KRef> = {};
    const roots: Record<string, SlotValue> = {};
    for (const [vatName, vatConfig] of Object.entries(config.vats)) {
      const rootRef = await this.launchVat(vatConfig);
      rootIds[vatName] = rootRef;
      roots[vatName] = kslot(rootRef, 'vatRoot');
    }
    const bootstrapRoot = rootIds[config.bootstrap];
    if (bootstrapRoot) {
      return this.queueMessage(bootstrapRoot, 'bootstrap', [roots]);
    }
    return undefined;
  }

  /**
   * Restarts a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns A promise for the restarted vat.
   */
  async restartVat(vatId: VatId): Promise<VatHandle> {
    const vat = this.#getVat(vatId);
    if (!vat) {
      throw new VatNotFoundError(vatId);
    }
    const { config } = vat;
    await this.#stopVat(vatId, false);
    await this.#runVat(vatId, config);
    return vat;
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
   */
  async #stopVat(vatId: VatId, terminating: boolean): Promise<void> {
    const vat = this.#getVat(vatId);
    if (!vat) {
      throw new VatNotFoundError(vatId);
    }
    await vat.terminate(terminating);
    await this.#vatWorkerService.terminate(vatId).catch(this.#logger.error);
    this.#vats.delete(vatId);
  }

  /**
   * Terminate a vat with extreme prejudice.
   *
   * @param vatId - The ID of the vat.
   */
  async terminateVat(vatId: VatId): Promise<void> {
    await this.#stopVat(vatId, true);
    this.#kernelStore.deleteVatConfig(vatId);
    // Mark for deletion (which will happen later, in vat-cleanup events)
    this.#kernelStore.markVatAsTerminated(vatId);
  }

  /**
   * Clear the database.
   */
  async clearStorage(): Promise<void> {
    this.#kernelStore.clear();
  }

  /**
   * Get a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns the vat's VatHandle.
   */
  #getVat(vatId: VatId): VatHandle {
    const vat = this.#vats.get(vatId);
    if (vat === undefined) {
      throw new VatNotFoundError(vatId);
    }
    return vat;
  }

  /**
   * Gets a list of the IDs of all running vats.
   *
   * XXX Question: is this usefully different from `getVats`?
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
  }[] {
    return Array.from(this.#vats.values()).map((vat) => ({
      id: vat.vatId,
      config: vat.config,
    }));
  }

  /**
   * Update the current cluster configuration
   *
   * @param config - The new cluster configuration
   */
  set clusterConfig(config: ClusterConfig) {
    isClusterConfig(config) || Fail`invalid cluster config`;
    this.#mostRecentSubcluster = config;
  }

  /**
   * Get the current cluster configuration
   *
   * @returns The current cluster configuration
   */
  get clusterConfig(): ClusterConfig | null {
    return this.#mostRecentSubcluster;
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
   * Ping a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns A promise that resolves to the result of the ping.
   */
  async pingVat(vatId: VatId): Promise<PingVatResult> {
    const vat = this.#getVat(vatId);
    return vat.ping();
  }

  /**
   * Reset the kernel state.
   * This is for debugging purposes only.
   */
  #resetKernelState(): void {
    this.#kernelStore.clear();
    this.#kernelStore.reset();
  }

  /**
   * Stop all running vats and reset the kernel state.
   * This is for debugging purposes only.
   */
  async reset(): Promise<void> {
    await this.terminateAllVats();
    this.#resetKernelState();
  }

  /**
   * Terminate all vats and collect garbage.
   * This is for debugging purposes only.
   */
  async terminateAllVats(): Promise<void> {
    for (const id of this.getVatIds().reverse()) {
      await this.terminateVat(id);
      this.collectGarbage();
    }
  }

  /**
   * Terminate all running vats and reload the default subcluster.
   * This is for debugging purposes only.
   */
  async reload(): Promise<void> {
    if (!this.#mostRecentSubcluster) {
      throw Error('no subcluster to reload');
    }
    await this.terminateAllVats();
    await this.launchSubcluster(this.#mostRecentSubcluster);
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
harden(Kernel);
