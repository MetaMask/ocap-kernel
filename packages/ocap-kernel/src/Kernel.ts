import type { CapData } from '@endo/marshal';
import {
  StreamReadError,
  VatAlreadyExistsError,
  VatDeletedError,
  VatNotFoundError,
  SubclusterNotFoundError,
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
import { kslot, kser, kunser } from './services/kernel-marshal.ts';
import type { SlotValue } from './services/kernel-marshal.ts';
import { makeKernelStore } from './store/index.ts';
import type { KernelStore } from './store/index.ts';
import type {
  VatId,
  KRef,
  VatWorkerService,
  ClusterConfig,
  VatConfig,
  KernelStatus,
  Subcluster,
  Message,
} from './types.ts';
import { ROOT_OBJECT_VREF, isClusterConfig } from './types.ts';
import { Fail, assert } from './utils/assert.ts';
import { VatHandle } from './VatHandle.ts';

type KernelService = {
  name: string;
  kref: string;
  service: object;
};

export class Kernel {
  /** Command channel from the controlling console/browser extension/test driver */
  readonly #commandStream: DuplexStream<JsonRpcCall, JsonRpcResponse>;

  readonly #rpcService: RpcService<typeof kernelHandlers>;

  /** Currently running vats, by ID */
  readonly #vats: Map<VatId, VatHandle>;

  /** Service to spawn workers (in iframes) for vats to run in */
  readonly #vatWorkerService: VatWorkerService;

  /** Storage holding the kernel's own persistent state */
  readonly #kernelStore: KernelStore;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** The kernel's router */
  readonly #kernelRouter: KernelRouter;

  /** Objects providing custom or kernel-privileged services to vats. */
  readonly #kernelServicesByName: Map<string, KernelService> = new Map();

  readonly #kernelServicesByObject: Map<string, KernelService> = new Map();

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
    vatWorkerService: VatWorkerService,
    kernelDatabase: KernelDatabase,
    options: {
      resetStorage?: boolean;
      logger?: Logger;
    } = {},
  ) {
    this.#commandStream = commandStream;
    this.#rpcService = new RpcService(kernelHandlers, {});
    this.#vats = new Map();
    this.#vatWorkerService = vatWorkerService;
    this.#logger = options.logger ?? new Logger('ocap-kernel');
    this.#kernelStore = makeKernelStore(kernelDatabase);
    if (options.resetStorage) {
      this.#resetKernelState();
    }
    this.#kernelQueue = new KernelQueue(
      this.#kernelStore,
      this.terminateVat.bind(this),
    );
    this.#kernelRouter = new KernelRouter(
      this.#kernelStore,
      this.#kernelQueue,
      this.#getVat.bind(this),
      this.#invokeKernelService.bind(this),
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
    vatWorkerService: VatWorkerService,
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
   * @param subclusterId - The ID of the subcluster to launch the vat in. Optional.
   * @returns a promise for the KRef of the new vat's root object.
   */
  async #launchVat(vatConfig: VatConfig, subclusterId?: string): Promise<KRef> {
    const vatId = this.#kernelStore.getNextVatId();
    await this.#runVat(vatId, vatConfig);
    this.#kernelStore.initEndpoint(vatId);
    const rootRef = this.#kernelStore.exportFromVat(vatId, ROOT_OBJECT_VREF);
    this.#kernelStore.setVatConfig(vatId, vatConfig);
    if (subclusterId) {
      this.#kernelStore.addSubclusterVat(subclusterId, vatId);
    }
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
    await this.#kernelQueue.waitForCrank();
    isClusterConfig(config) || Fail`invalid cluster config`;
    if (!config.vats[config.bootstrap]) {
      Fail`invalid bootstrap vat name ${config.bootstrap}`;
    }
    const subclusterId = this.#kernelStore.addSubcluster(config);
    return this.#launchVatsForSubcluster(subclusterId, config);
  }

  /**
   * Terminates a named sub-cluster of vats.
   *
   * @param subclusterId - The id of the subcluster to terminate.
   * @returns A promise that resolves when termination is complete.
   */
  async terminateSubcluster(subclusterId: string): Promise<void> {
    await this.#kernelQueue.waitForCrank();
    if (!this.#kernelStore.getSubcluster(subclusterId)) {
      throw new SubclusterNotFoundError(subclusterId);
    }
    const vatIdsToTerminate = this.#kernelStore.getSubclusterVats(subclusterId);
    for (const vatId of vatIdsToTerminate.reverse()) {
      await this.terminateVat(vatId);
      this.collectGarbage();
    }
    this.#kernelStore.deleteSubcluster(subclusterId);
  }

  /**
   * Reloads a named subcluster by restarting all its vats.
   * This terminates and restarts all vats in the subcluster.
   *
   * @param subclusterId - The id of the subcluster to reload.
   * @returns A promise for an object containing the subcluster.
   * @throws If the subcluster is not found.
   */
  async reloadSubcluster(subclusterId: string): Promise<Subcluster> {
    await this.#kernelQueue.waitForCrank();
    const subcluster = this.getSubcluster(subclusterId);
    if (!subcluster) {
      throw new SubclusterNotFoundError(subclusterId);
    }
    for (const vatId of subcluster.vats.reverse()) {
      await this.terminateVat(vatId);
      this.collectGarbage();
    }
    const newId = this.#kernelStore.addSubcluster(subcluster.config);
    await this.#launchVatsForSubcluster(newId, subcluster.config);
    const newSubcluster = this.getSubcluster(newId);
    if (!newSubcluster) {
      throw new SubclusterNotFoundError(newId);
    }
    return newSubcluster;
  }

  /**
   * Retrieves a subcluster by its ID.
   *
   * @param subclusterId - The id of the subcluster.
   * @returns The subcluster, or undefined if not found.
   */
  getSubcluster(subclusterId: string): Subcluster | undefined {
    return this.#kernelStore.getSubcluster(subclusterId);
  }

  /**
   * Gets all subclusters.
   *
   * @returns An array of subcluster information records.
   */
  getSubclusters(): Subcluster[] {
    return this.#kernelStore.getSubclusters();
  }

  /**
   * Checks if a vat belongs to a specific subcluster.
   *
   * @param vatId - The ID of the vat to check.
   * @param subclusterId - The ID of the subcluster to check against.
   * @returns True if the vat belongs to the specified subcluster, false otherwise.
   */
  isVatInSubcluster(vatId: VatId, subclusterId: string): boolean {
    return this.#kernelStore.getVatSubcluster(vatId) === subclusterId;
  }

  /**
   * Gets all vat IDs that belong to a specific subcluster.
   *
   * @param subclusterId - The ID of the subcluster to get vats for.
   * @returns An array of vat IDs that belong to the specified subcluster.
   */
  getSubclusterVats(subclusterId: string): VatId[] {
    return this.#kernelStore.getSubclusterVats(subclusterId);
  }

  /**
   * Launches all vats for a subcluster and sets up their bootstrap connections.
   *
   * @param subclusterId - The ID of the subcluster to launch vats for.
   * @param config - The configuration for the subcluster.
   * @returns A promise for the (CapData encoded) result of the bootstrap message, if any.
   */
  async #launchVatsForSubcluster(
    subclusterId: string,
    config: ClusterConfig,
  ): Promise<CapData<KRef> | undefined> {
    const rootIds: Record<string, KRef> = {};
    const roots: Record<string, SlotValue> = {};
    for (const [vatName, vatConfig] of Object.entries(config.vats)) {
      const rootRef = await this.#launchVat(vatConfig, subclusterId);
      rootIds[vatName] = rootRef;
      roots[vatName] = kslot(rootRef, 'vatRoot');
    }
    const services: Record<string, SlotValue> = {};
    if (config.services) {
      for (const name of config.services) {
        const possibleService = this.#kernelServicesByName.get(name);
        if (possibleService) {
          const { kref } = possibleService;
          services[name] = kslot(kref);
        } else {
          throw Error(`no registered kernel service '${name}'`);
        }
      }
    }
    const bootstrapRoot = rootIds[config.bootstrap];
    if (bootstrapRoot) {
      const result = await this.queueMessage(bootstrapRoot, 'bootstrap', [
        roots,
        services,
      ]);
      const unserialized = kunser(result);
      if (unserialized instanceof Error) {
        throw unserialized;
      }
      return result;
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
    await this.#kernelQueue.waitForCrank();
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
   * @param reason - If the vat is being terminated, the reason for the termination.
   */
  async #stopVat(
    vatId: VatId,
    terminating: boolean,
    reason?: CapData<KRef>,
  ): Promise<void> {
    const vat = this.#getVat(vatId);
    if (!vat) {
      throw new VatNotFoundError(vatId);
    }

    let terminationError: Error | undefined;
    if (reason) {
      terminationError = new Error(`Vat termination: ${reason.body}`);
    } else if (terminating) {
      terminationError = new VatDeletedError(vatId);
    }

    await this.#vatWorkerService
      .terminate(vatId, terminationError)
      .catch(this.#logger.error);
    await vat.terminate(terminating, terminationError);
    this.#vats.delete(vatId);
  }

  /**
   * Terminate a vat with extreme prejudice.
   *
   * @param vatId - The ID of the vat.
   * @param reason - If the vat is being terminated, the reason for the termination.
   */
  async terminateVat(vatId: VatId, reason?: CapData<KRef>): Promise<void> {
    await this.#kernelQueue.waitForCrank();
    await this.#stopVat(vatId, true, reason);
    // Mark for deletion (which will happen later, in vat-cleanup events)
    this.#kernelStore.markVatAsTerminated(vatId);
  }

  /**
   * Clear the database.
   */
  async clearStorage(): Promise<void> {
    await this.#kernelQueue.waitForCrank();
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
    subclusterId: string;
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
   * Revoke an exported object. Idempotent. Revoking promises is not supported.
   *
   * @param kref - The KRef of the object to revoke.
   * @throws If the object is a promise.
   */
  revoke(kref: KRef): void {
    this.#kernelStore.revoke(kref);
  }

  /**
   * Check if an object is revoked.
   *
   * @param kref - The KRef of the object to check.
   * @returns True if the object is revoked, false otherwise.
   */
  isRevoked(kref: KRef): boolean {
    return this.#kernelStore.isRevoked(kref);
  }

  /**
   * Get the current kernel status, defined as the current cluster configuration
   * and a list of all running vats.
   *
   * @returns The current kernel status containing vats and subclusters information.
   */
  async getStatus(): Promise<KernelStatus> {
    await this.#kernelQueue.waitForCrank();
    return {
      vats: this.getVats(),
      subclusters: this.#kernelStore.getSubclusters(),
    };
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
    await this.#kernelQueue.waitForCrank();
    try {
      await this.terminateAllVats();
      this.#resetKernelState();
    } catch (error) {
      this.#logger.error('Error resetting kernel:', error);
      throw error;
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
   * Terminate all running vats and reload them.
   * This is for debugging purposes only.
   */
  async reload(): Promise<void> {
    await this.#kernelQueue.waitForCrank();
    const subclusters = this.#kernelStore.getSubclusters();
    await this.terminateAllVats();
    for (const subcluster of subclusters) {
      await this.#kernelQueue.waitForCrank();
      const newId = this.#kernelStore.addSubcluster(subcluster.config);
      await this.#launchVatsForSubcluster(newId, subcluster.config);
    }
  }

  /**
   * Gracefully stop the kernel without terminating vats.
   */
  async stop(): Promise<void> {
    await this.#kernelQueue.waitForCrank();
    this.#logger.info('Stopping kernel gracefully...');
    await this.#commandStream.end();
    await this.#vatWorkerService.terminateAll();
    this.#logger.info('Kernel stopped gracefully');
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

  registerKernelServiceObject(name: string, service: object): void {
    const kref = this.#kernelStore.initKernelObject('kernel');
    const kernelService = { name, kref, service };
    this.#kernelServicesByName.set(name, kernelService);
    this.#kernelServicesByObject.set(kref, kernelService);
  }

  async #invokeKernelService(target: KRef, message: Message): Promise<void> {
    const kernelService = this.#kernelServicesByObject.get(target);
    if (!kernelService) {
      throw Error(`no registered service for ${target}`);
    }
    const { methargs, result } = message;
    const [method, args] = kunser(methargs) as [string, unknown[]];
    assert.typeof(method, 'string');
    if (result) {
      assert.typeof(result, 'string');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const service = kernelService.service as Record<string, Function>;
    const methodFunction = service[method];
    if (methodFunction === undefined) {
      if (result) {
        this.#kernelQueue.resolvePromises('kernel', [
          [result, true, kser(Error(`unknown service method '${method}'`))],
        ]);
      } else {
        this.#logger.error(`unknown service method '${method}'`);
      }
      return;
    }
    assert.typeof(methodFunction, 'function');
    assert(Array.isArray(args));
    try {
      // eslint-disable-next-line prefer-spread
      const resultValue = await methodFunction.apply(null, args);
      if (result) {
        this.#kernelQueue.resolvePromises('kernel', [
          [result, false, kser(resultValue)],
        ]);
      }
    } catch (problem) {
      if (result) {
        this.#kernelQueue.resolvePromises('kernel', [
          [result, true, kser(problem)],
        ]);
      } else {
        this.#logger.error('error in kernel service method:', problem);
      }
    }
  }
}
harden(Kernel);
