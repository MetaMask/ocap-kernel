import type { CapData } from '@endo/marshal';
import type { KernelDatabase } from '@metamask/kernel-store';
import { Logger } from '@metamask/logger';

import { KernelQueue } from './KernelQueue.ts';
import { KernelRouter } from './KernelRouter.ts';
import { KernelServiceManager } from './KernelServiceManager.ts';
import type { KernelService } from './KernelServiceManager.ts';
import { OcapURLManager } from './remotes/kernel/OcapURLManager.ts';
import { RemoteManager } from './remotes/kernel/RemoteManager.ts';
import type { RemoteCommsOptions } from './remotes/types.ts';
import type { PingVatResult } from './rpc/index.ts';
import { makeKernelStore } from './store/index.ts';
import type { KernelStore } from './store/index.ts';
import type {
  VatId,
  SystemVatId,
  EndpointId,
  KRef,
  PlatformServices,
  ClusterConfig,
  SystemVatConfig,
  VatConfig,
  KernelStatus,
  Subcluster,
  SubclusterLaunchResult,
  EndpointHandle,
} from './types.ts';
import { isVatId, isRemoteId, isSystemVatId } from './types.ts';
import { SubclusterManager } from './vats/SubclusterManager.ts';
import { SystemVatManager } from './vats/SystemVatManager.ts';
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
  /** Manages vat lifecycle operations */
  readonly #vatManager: VatManager;

  /** Manages subcluster operations */
  readonly #subclusterManager: SubclusterManager;

  /** Manages system vat operations */
  readonly #systemVatManager: SystemVatManager;

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
   * Host vat configuration passed to Kernel.make().
   * Stored for connection after initialization.
   */
  readonly #hostVatConfig: SystemVatConfig | undefined;

  /**
   * Construct a new kernel instance.
   *
   * @param platformServices - Service to do things the kernel worker can't.
   * @param kernelDatabase - Database holding the kernel's persistent state.
   * @param options - Options for the kernel constructor.
   * @param options.resetStorage - If true, the storage will be cleared.
   * @param options.logger - Optional logger for error and diagnostic output.
   * @param options.keySeed - Optional seed for libp2p key generation.
   * @param options.mnemonic - Optional BIP39 mnemonic for deriving the kernel identity.
   * @param options.hostVat - Optional host vat configuration to connect at kernel creation.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor(
    platformServices: PlatformServices,
    kernelDatabase: KernelDatabase,
    options: {
      resetStorage?: boolean;
      logger?: Logger;
      keySeed?: string | undefined;
      mnemonic?: string | undefined;
      hostVat?: SystemVatConfig;
    } = {},
  ) {
    this.#platformServices = platformServices;
    this.#logger = options.logger ?? new Logger('ocap-kernel');
    this.#kernelStore = makeKernelStore(kernelDatabase, this.#logger);
    this.#hostVatConfig = options.hostVat;
    if (!this.#kernelStore.kv.get('initialized')) {
      this.#kernelStore.kv.set('initialized', 'true');
    }

    if (options.resetStorage) {
      this.#resetKernelState();
      // If mnemonic is provided with resetStorage, also clear identity
      // to allow recovery with the new mnemonic
      if (options.mnemonic) {
        this.#kernelStore.kv.delete('keySeed');
        this.#kernelStore.kv.delete('peerId');
        this.#kernelStore.kv.delete('ocapURLKey');
      }
    }
    this.#kernelQueue = new KernelQueue(
      this.#kernelStore,
      async (vatId, reason) => this.#vatManager.terminateVat(vatId, reason),
    );

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
      mnemonic: options.mnemonic,
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

    this.#systemVatManager = new SystemVatManager({
      kernelStore: this.#kernelStore,
      kernelQueue: this.#kernelQueue,
      kernelFacetDeps: {
        launchSubcluster: this.launchSubcluster.bind(this),
        terminateSubcluster: this.terminateSubcluster.bind(this),
        reloadSubcluster: this.reloadSubcluster.bind(this),
        getSubcluster: this.getSubcluster.bind(this),
        getSubclusters: this.getSubclusters.bind(this),
        getStatus: this.getStatus.bind(this),
      },
      registerKernelService: (name, service) =>
        this.#kernelServiceManager.registerKernelServiceObject(name, service),
      logger: this.#logger.subLogger({ tags: ['SystemVatManager'] }),
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
   * @param platformServices - Service to do things the kernel worker can't.
   * @param kernelDatabase - Database holding the kernel's persistent state.
   * @param options - Options for the kernel constructor.
   * @param options.resetStorage - If true, the storage will be cleared.
   * @param options.logger - Optional logger for error and diagnostic output.
   * @param options.keySeed - Optional seed for libp2p key generation.
   * @param options.mnemonic - Optional BIP39 mnemonic for deriving the kernel identity.
   * @param options.hostVat - Optional host vat configuration to connect at kernel creation.
   * @returns A promise for the new kernel instance.
   */
  static async make(
    platformServices: PlatformServices,
    kernelDatabase: KernelDatabase,
    options: {
      resetStorage?: boolean;
      logger?: Logger;
      keySeed?: string | undefined;
      mnemonic?: string | undefined;
      hostVat?: SystemVatConfig;
    } = {},
  ): Promise<Kernel> {
    const kernel = new Kernel(platformServices, kernelDatabase, options);
    await kernel.#init();
    return kernel;
  }

  /**
   * Start the kernel running.
   */
  async #init(): Promise<void> {
    // Set up the remote message handler
    this.#remoteManager.setMessageHandler(
      async (from: string, message: string) =>
        this.#remoteManager.handleRemoteMessage(from, message),
    );

    // Clean up any orphaned system vat state from a previous session.
    // This handles crash recovery where disconnect was never called.
    this.#cleanupOrphanedSystemVats();

    // Start all vats that were previously running before starting the queue
    // This ensures that any messages in the queue have their target vats ready
    await this.#vatManager.initializeAllVats();

    // Register host vat if configured.
    // This runs asynchronously - the registration completes when the supervisor
    // side calls connect() via the transport's awaitConnection().
    if (this.#hostVatConfig) {
      this.#systemVatManager
        .registerSystemVat(this.#hostVatConfig)
        .catch((error) => {
          this.#logger.error(
            `Failed to register host vat ${this.#hostVatConfig?.name}:`,
            error,
          );
        });
    }

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
   * Clean up orphaned system vat state from a previous session.
   *
   * System vats are ephemeral - they don't persist across restarts. However,
   * their krefs (for owned objects) are persisted to the database. If the
   * kernel restarts without properly disconnecting system vats (e.g., crash,
   * browser refresh), orphaned state can remain.
   *
   * This method scans for system vat state and cleans it up before new
   * system vats are registered, ensuring a clean slate.
   */
  #cleanupOrphanedSystemVats(): void {
    // Scan for system vat c-list keys (sv*.c.*) to find orphaned system vats
    const orphanedSystemVatIds = new Set<SystemVatId>();
    const { kv } = this.#kernelStore;

    // Look for c-list entries with system vat prefixes (sv0, sv1, etc.)
    // C-list keys use the format: {endpointId}.c.{slot}
    let key: string | undefined = 'sv';
    while ((key = kv.getNextKey(key)) !== undefined) {
      if (!key.startsWith('sv')) {
        break;
      }
      // Extract the system vat ID from keys like "sv0.c.o+0"
      const parts = key.split('.');
      if (parts.length >= 2 && parts[1] === 'c') {
        const endpointId = parts[0];
        if (isSystemVatId(endpointId)) {
          orphanedSystemVatIds.add(endpointId);
        }
      }
    }

    for (const systemVatId of orphanedSystemVatIds) {
      this.#logger.log(
        `Cleaning up orphaned system vat state for ${systemVatId}`,
      );

      // Reject pending promises where this vat was the decider
      const failure = { body: '"System vat disconnected (orphan cleanup)"' };
      for (const kpid of this.#kernelStore.getPromisesByDecider(systemVatId)) {
        // Since there's no active vat, we directly resolve the promise
        // in the kernel store rather than going through the queue
        this.#kernelStore.resolveKernelPromise(kpid, true, {
          ...failure,
          slots: [],
        });
      }

      // Clean up kernel state: exports, imports, promises, c-list entries
      const work = this.#kernelStore.cleanupTerminatedVat(systemVatId);
      this.#logger.debug(
        `Orphaned system vat ${systemVatId} cleanup: ${work.exports} exports, ${work.imports} imports, ${work.promises} promises`,
      );
    }

    if (orphanedSystemVatIds.size > 0) {
      this.#logger.log(
        `Cleaned up ${orphanedSystemVatIds.size} orphaned system vat(s)`,
      );
    }
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
   * @returns A promise for the subcluster ID and the (CapData encoded) result
   * of the bootstrap message.
   */
  async launchSubcluster(
    config: ClusterConfig,
  ): Promise<SubclusterLaunchResult> {
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
   * @throws If the endpoint ID is invalid (neither a vat ID, remote ID, nor system vat ID).
   */
  #getEndpoint(endpointId: EndpointId): EndpointHandle {
    if (isVatId(endpointId)) {
      return this.#vatManager.getVat(endpointId);
    }
    if (isRemoteId(endpointId)) {
      return this.#remoteManager.getRemote(endpointId);
    }
    if (isSystemVatId(endpointId)) {
      const systemVatId = endpointId as SystemVatId;
      const handle = this.#systemVatManager.getSystemVatHandle(systemVatId);
      if (!handle) {
        throw Error(`system vat ${systemVatId} not found`);
      }
      return handle;
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
   * Returns a promise that resolves in a future crank to avoid deadlock when
   * called from within a crank (e.g., via E(kernelFacet).getStatus()).
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
