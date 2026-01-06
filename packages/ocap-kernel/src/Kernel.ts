import type { CapData } from '@endo/marshal';
import { RpcService } from '@metamask/kernel-rpc-methods';
import type { KernelDatabase } from '@metamask/kernel-store';
import type { JsonRpcCall } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { serializeError } from '@metamask/rpc-errors';
import type { DuplexStream } from '@metamask/streams';
import { hasProperty } from '@metamask/utils';
import type { JsonRpcResponse } from '@metamask/utils';

import { KernelQueue } from './KernelQueue.ts';
import { KernelRouter } from './KernelRouter.ts';
import { KernelServiceManager } from './KernelServiceManager.ts';
import type { KernelService } from './KernelServiceManager.ts';
import { OcapURLManager } from './remotes/OcapURLManager.ts';
import { RemoteManager } from './remotes/RemoteManager.ts';
import type { RemoteCommsOptions } from './remotes/types.ts';
import { kernelHandlers } from './rpc/index.ts';
import type { PingVatResult } from './rpc/index.ts';
import { makeKernelStore } from './store/index.ts';
import type { KernelStore } from './store/index.ts';
import type {
  VatId,
  EndpointId,
  KRef,
  PlatformServices,
  ClusterConfig,
  VatConfig,
  KernelStatus,
  Subcluster,
  EndpointHandle,
} from './types.ts';
import { isVatId, isRemoteId } from './types.ts';
import { SubclusterManager } from './vats/SubclusterManager.ts';
import type { VatHandle } from './vats/VatHandle.ts';
import { VatManager } from './vats/VatManager.ts';

/**
 * The main class for the ocap kernel. It is responsible for
 * managing the lifecycle of the kernel and the vats.
 *
 * @param commandStream - Command channel from whatever external software is driving the kernel.
 * @param platformServices - Service to do things the kernel worker can't.
 * @param kernelDatabase - Database holding the kernel's persistent state.
 * @param options - Options for the kernel constructor.
 * @param options.resetStorage - If true, the storage will be cleared.
 * @param options.logger - Optional logger for error and diagnostic output.
 * @param options.keySeed - Optional seed for libp2p key generation.
 * @returns A new {@link Kernel}.
 */
export class Kernel {
  /** Command channel from the controlling console/browser extension/test driver */
  readonly #commandStream: DuplexStream<JsonRpcCall, JsonRpcResponse>;

  readonly #rpcService: RpcService<typeof kernelHandlers>;

  /** Manages vat lifecycle operations */
  readonly #vatManager: VatManager;

  /** Manages subcluster operations */
  readonly #subclusterManager: SubclusterManager;

  /** Manages remote kernel connections */
  readonly #remoteManager: RemoteManager;

  /** Manages OCAP URL issuing and redemption */
  readonly #ocapURLManager: OcapURLManager;

  /** Manages kernel service registration and invocation */
  readonly #kernelServiceManager: KernelServiceManager;

  /**
   * Service to to things the kernel worker can't do: network communications
   * and spawning workers (in iframes) for vats to run in
   */
  readonly #platformServices: PlatformServices;

  /** Storage holding the kernel's own persistent state */
  readonly #kernelStore: KernelStore;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** The kernel's router */
  readonly #kernelRouter: KernelRouter;

  /**
   * Construct a new kernel instance.
   *
   * @param commandStream - Command channel from whatever external software is driving the kernel.
   * @param platformServices - Service to do things the kernel worker can't.
   * @param kernelDatabase - Database holding the kernel's persistent state.
   * @param options - Options for the kernel constructor.
   * @param options.resetStorage - If true, the storage will be cleared.
   * @param options.logger - Optional logger for error and diagnostic output.
   * @param options.keySeed - Optional seed for libp2p key generation.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor(
    commandStream: DuplexStream<JsonRpcCall, JsonRpcResponse>,
    platformServices: PlatformServices,
    kernelDatabase: KernelDatabase,
    options: {
      resetStorage?: boolean;
      logger?: Logger;
      keySeed?: string | undefined;
    } = {},
  ) {
    this.#commandStream = commandStream;
    this.#platformServices = platformServices;
    this.#logger = options.logger ?? new Logger('ocap-kernel');
    this.#kernelStore = makeKernelStore(kernelDatabase, this.#logger);
    if (!this.#kernelStore.kv.get('initialized')) {
      this.#kernelStore.kv.set('initialized', 'true');
    }

    if (options.resetStorage) {
      this.#resetKernelState();
    }
    this.#kernelQueue = new KernelQueue(
      this.#kernelStore,
      async (vatId, reason) => this.#vatManager.terminateVat(vatId, reason),
    );

    this.#rpcService = new RpcService(kernelHandlers, {});

    this.#vatManager = new VatManager({
      platformServices,
      kernelStore: this.#kernelStore,
      kernelQueue: this.#kernelQueue,
      logger: this.#logger.subLogger({ tags: ['VatManager'] }),
    });

    this.#remoteManager = new RemoteManager({
      platformServices,
      kernelStore: this.#kernelStore,
      kernelQueue: this.#kernelQueue,
      logger: this.#logger.subLogger({ tags: ['RemoteManager'] }),
      keySeed: options.keySeed,
    });

    this.#ocapURLManager = new OcapURLManager({
      remoteManager: this.#remoteManager,
    });

    this.#kernelServiceManager = new KernelServiceManager({
      kernelStore: this.#kernelStore,
      kernelQueue: this.#kernelQueue,
      logger: this.#logger.subLogger({ tags: ['KernelServiceManager'] }),
    });

    this.#subclusterManager = new SubclusterManager({
      kernelStore: this.#kernelStore,
      kernelQueue: this.#kernelQueue,
      vatManager: this.#vatManager,
      getKernelService: (name) =>
        this.#kernelServiceManager.getKernelService(name),
      queueMessage: this.queueMessage.bind(this),
    });

    this.#kernelRouter = new KernelRouter(
      this.#kernelStore,
      this.#kernelQueue,
      this.#getEndpoint.bind(this),
      this.#kernelServiceManager.invokeKernelService.bind(
        this.#kernelServiceManager,
      ),
      this.#logger,
    );

    // Register OCAP URL services
    const { issuerService, redemptionService } =
      this.#ocapURLManager.getServices();
    this.#kernelServiceManager.registerKernelServiceObject(
      issuerService.name,
      issuerService.service,
    );
    this.#kernelServiceManager.registerKernelServiceObject(
      redemptionService.name,
      redemptionService.service,
    );

    harden(this);
  }

  /**
   * Create a new kernel instance.
   *
   * @param commandStream - Command channel from whatever external software is driving the kernel.
   * @param platformServices - Service to do things the kernel worker can't.
   * @param kernelDatabase - Database holding the kernel's persistent state.
   * @param options - Options for the kernel constructor.
   * @param options.resetStorage - If true, the storage will be cleared.
   * @param options.logger - Optional logger for error and diagnostic output.
   * @param options.keySeed - Optional seed for libp2p key generation.
   * @returns A promise for the new kernel instance.
   */
  static async make(
    commandStream: DuplexStream<JsonRpcCall, JsonRpcResponse>,
    platformServices: PlatformServices,
    kernelDatabase: KernelDatabase,
    options: {
      resetStorage?: boolean;
      logger?: Logger;
      keySeed?: string | undefined;
    } = {},
  ): Promise<Kernel> {
    const kernel = new Kernel(
      commandStream,
      platformServices,
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
    // Set up the remote message handler
    this.#remoteManager.setMessageHandler(
      async (from: string, message: string) =>
        this.#remoteManager.handleRemoteMessage(from, message),
    );

    // Start the command stream handler (non-blocking)
    // This runs for the entire lifetime of the kernel
    this.#commandStream
      .drain(this.#handleCommandMessage.bind(this))
      .catch((error) => {
        this.#logger.error(
          'Stream read error (kernel may be non-functional):',
          error,
        );
        // Don't re-throw to avoid unhandled rejection in this long-running task
      });

    // Start all vats that were previously running before starting the queue
    // This ensures that any messages in the queue have their target vats ready
    await this.#vatManager.initializeAllVats();

    // Start the kernel queue processing (non-blocking)
    // This runs for the entire lifetime of the kernel
    this.#kernelQueue
      .run(this.#kernelRouter.deliver.bind(this.#kernelRouter))
      .catch((error) => {
        this.#logger.error(
          'Run loop error (kernel may be non-functional):',
          error,
        );
        // Don't re-throw to avoid unhandled rejection in this long-running task
      });
  }

  /**
   * Initialize the remote comms object.
   *
   * @param options - Options for remote communications initialization.
   * @returns A promise that resolves when initialization is complete.
   */
  async initRemoteComms(options?: RemoteCommsOptions): Promise<void> {
    await this.#remoteManager.initRemoteComms(options);
  }

  /**
   * Send a message to a remote kernel.
   *
   * @param to - The peer ID of the remote kernel.
   * @param message - The message to send.
   */
  async sendRemoteMessage(to: string, message: string): Promise<void> {
    await this.#remoteManager.sendRemoteMessage(to, message);
  }

  /**
   * Explicitly close a connection to a peer.
   * Marks the peer as intentionally closed to prevent automatic reconnection.
   *
   * @param peerId - The peer ID to close the connection for.
   */
  async closeConnection(peerId: string): Promise<void> {
    await this.#remoteManager.closeConnection(peerId);
  }

  /**
   * Manually reconnect to a peer after intentional close.
   * Clears the intentional close flag and initiates reconnection.
   *
   * @param peerId - The peer ID to reconnect to.
   * @param hints - Optional hints for reconnection.
   */
  async reconnectPeer(peerId: string, hints: string[] = []): Promise<void> {
    await this.#remoteManager.reconnectPeer(peerId, hints);
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
   * Send a message from the kernel to an object in a vat.
   *
   * @param target - The object to which the message is directed.
   * @param method - The method to be invoked.
   * @param args - Message arguments.
   * @returns A promise for the CapData encoded result of the message invocation.
   */
  async queueMessage(
    target: KRef,
    method: string,
    args: unknown[],
  ): Promise<CapData<KRef>> {
    return this.#kernelQueue.enqueueMessage(target, method, args);
  }

  /**
   * Register a kernel service object.
   *
   * @param name - The name of the service.
   * @param object - The service object to register.
   * @returns The registration details including the kref.
   */
  registerKernelServiceObject(name: string, object: object): KernelService {
    return this.#kernelServiceManager.registerKernelServiceObject(name, object);
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
    return this.#subclusterManager.launchSubcluster(config);
  }

  /**
   * Terminates a named sub-cluster of vats.
   *
   * @param subclusterId - The id of the subcluster to terminate.
   * @returns A promise that resolves when termination is complete.
   */
  async terminateSubcluster(subclusterId: string): Promise<void> {
    return this.#subclusterManager.terminateSubcluster(subclusterId);
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
    return this.#subclusterManager.reloadSubcluster(subclusterId);
  }

  /**
   * Retrieves a subcluster by its ID.
   *
   * @param subclusterId - The id of the subcluster.
   * @returns The subcluster, or undefined if not found.
   */
  getSubcluster(subclusterId: string): Subcluster | undefined {
    return this.#subclusterManager.getSubcluster(subclusterId);
  }

  /**
   * Gets all subclusters.
   *
   * @returns An array of all subcluster records.
   */
  getSubclusters(): Subcluster[] {
    return this.#subclusterManager.getSubclusters();
  }

  /**
   * Checks if a vat belongs to a specific subcluster.
   *
   * @param vatId - The ID of the vat to check.
   * @param subclusterId - The ID of the subcluster to check membership against.
   * @returns True if the vat belongs to the specified subcluster, false otherwise.
   */
  isVatInSubcluster(vatId: VatId, subclusterId: string): boolean {
    return this.#subclusterManager.isVatInSubcluster(vatId, subclusterId);
  }

  /**
   * Gets all vat IDs that belong to a specific subcluster.
   *
   * @param subclusterId - The ID of the subcluster to retrieve vat IDs from.
   * @returns An array of vat IDs belonging to the specified subcluster.
   */
  getSubclusterVats(subclusterId: string): VatId[] {
    return this.#subclusterManager.getSubclusterVats(subclusterId);
  }

  /**
   * Restarts a vat.
   *
   * @param vatId - The ID of the vat to restart.
   * @returns A promise for the restarted vat handle.
   */
  async restartVat(vatId: VatId): Promise<VatHandle> {
    return this.#vatManager.restartVat(vatId);
  }

  /**
   * Terminate a vat with extreme prejudice.
   *
   * @param vatId - The ID of the vat to terminate.
   * @param reason - The reason for the termination, if any.
   * @returns A promise that resolves when the vat has been terminated.
   */
  async terminateVat(vatId: VatId, reason?: CapData<KRef>): Promise<void> {
    return this.#vatManager.terminateVat(vatId, reason);
  }

  /**
   * Clear the database.
   */
  async clearStorage(): Promise<void> {
    await this.#kernelQueue.waitForCrank();
    this.#kernelStore.clear();
  }

  /**
   * Gets an endpoint by its ID.
   *
   * @param endpointId - The ID of the endpoint to retrieve.
   * @returns The endpoint handle for the given ID.
   * @throws If the endpoint ID is invalid (neither a vat ID nor a remote ID).
   */
  #getEndpoint(endpointId: EndpointId): EndpointHandle {
    if (isVatId(endpointId)) {
      return this.#vatManager.getVat(endpointId);
    }
    if (isRemoteId(endpointId)) {
      return this.#remoteManager.getRemote(endpointId);
    }
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw Error(`invalid endpoint ID ${endpointId}`);
  }

  /**
   * Gets a list of the IDs of all running vats.
   *
   * @returns An array of all running vat IDs.
   */
  getVatIds(): VatId[] {
    return this.#vatManager.getVatIds();
  }

  /**
   * Gets a list of information about all running vats.
   *
   * @returns An array of vat information records containing ID, config, and subcluster ID.
   */
  getVats(): {
    id: VatId;
    config: VatConfig;
    subclusterId: string;
  }[] {
    return this.#vatManager.getVats();
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
   * @returns A promise for the current kernel status containing vats, subclusters, and remote comms information.
   */
  async getStatus(): Promise<KernelStatus> {
    await this.#kernelQueue.waitForCrank();
    return {
      vats: this.getVats(),
      subclusters: this.#subclusterManager.getSubclusters(),
      remoteComms: this.#remoteManager.isRemoteCommsInitialized()
        ? {
            isInitialized: true,
            peerId: this.#remoteManager.getPeerId(),
          }
        : { isInitialized: false },
    };
  }

  /**
   * Reap vats that match the filter.
   *
   * @param filter - A function that returns true if the vat should be reaped.
   */
  reapVats(filter: (vatId: VatId) => boolean = () => true): void {
    this.#vatManager.reapVats(filter);
  }

  /**
   * Pin a vat root.
   *
   * @param vatId - The ID of the vat whose root to pin.
   * @returns The KRef of the pinned vat root.
   */
  pinVatRoot(vatId: VatId): KRef {
    return this.#vatManager.pinVatRoot(vatId);
  }

  /**
   * Unpin a vat root.
   *
   * @param vatId - The ID of the vat whose root to unpin.
   */
  unpinVatRoot(vatId: VatId): void {
    this.#vatManager.unpinVatRoot(vatId);
  }

  /**
   * Ping a vat.
   *
   * @param vatId - The ID of the vat to ping.
   * @returns A promise that resolves to the ping result.
   */
  async pingVat(vatId: VatId): Promise<PingVatResult> {
    return this.#vatManager.pingVat(vatId);
  }

  /**
   * Reset the kernel state.
   */
  #resetKernelState(): void {
    this.#kernelStore.reset({
      // XXX special case hack so that network address survives restart when testing
      except: ['keySeed', 'peerId', 'ocapURLKey'],
    });
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
    await this.#vatManager.terminateAllVats();
  }

  /**
   * Terminate all running vats and reload them.
   * This is for debugging purposes only.
   */
  async reload(): Promise<void> {
    await this.#subclusterManager.reloadAllSubclusters();
  }

  /**
   * Gracefully stop the kernel without deleting vats.
   */
  async stop(): Promise<void> {
    await this.#kernelQueue.waitForCrank();
    await this.#commandStream.end();
    await this.#platformServices.stopRemoteComms();
    this.#remoteManager.cleanup();
    await this.#platformServices.terminateAll();
  }

  /**
   * Collect garbage.
   * This is for debugging purposes only.
   */
  collectGarbage(): void {
    this.#vatManager.collectGarbage();
  }
}
harden(Kernel);
