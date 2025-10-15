import { Far } from '@endo/marshal';
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
import { kslot, kser, kunser, krefOf } from './liveslots/kernel-marshal.ts';
import type { SlotValue } from './liveslots/kernel-marshal.ts';
import { initRemoteComms, parseOcapURL } from './remote-comms.ts';
import { RemoteHandle } from './RemoteHandle.ts';
import { kernelHandlers } from './rpc/index.ts';
import type { PingVatResult } from './rpc/index.ts';
import { makeKernelStore } from './store/index.ts';
import type { KernelStore } from './store/index.ts';
import type {
  VatId,
  RemoteId,
  EndpointId,
  KRef,
  PlatformServices,
  ClusterConfig,
  VatConfig,
  KernelStatus,
  Subcluster,
  Message,
  EndpointHandle,
  RemoteComms,
} from './types.ts';
import { isVatId, isRemoteId } from './types.ts';
import { assert } from './utils/assert.ts';
import { SubclusterManager } from './vats/SubclusterManager.ts';
import type { VatHandle } from './vats/VatHandle.ts';
import { VatManager } from './vats/VatManager.ts';

type KernelService = {
  name: string;
  kref: string;
  service: object;
};

// XXX See #egregiousDebugHack below
let foolTheCompiler: string = 'start';

export class Kernel {
  /** Command channel from the controlling console/browser extension/test driver */
  readonly #commandStream: DuplexStream<JsonRpcCall, JsonRpcResponse>;

  readonly #rpcService: RpcService<typeof kernelHandlers>;

  /** Manages vat lifecycle operations */
  readonly #vatManager: VatManager;

  /** Manages subcluster operations */
  readonly #subclusterManager: SubclusterManager;

  /** Currently active remote kernel connections, by ID */
  readonly #remotes: Map<RemoteId, RemoteHandle>;

  /** Currently active remote kernel connections, by remote Peer ID */
  readonly #remotesByPeer: Map<string, RemoteHandle>;

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

  /** Objects providing custom or kernel-privileged services to vats. */
  readonly #kernelServicesByName: Map<string, KernelService> = new Map();

  readonly #kernelServicesByObject: Map<string, KernelService> = new Map();

  /** My network access */
  #remoteComms: RemoteComms | undefined;

  /**
   * Construct a new kernel instance.
   *
   * @param commandStream - Command channel from whatever external software is driving the kernel.
   * @param platformServices - Service to do things the kernel worker can't.
   * @param kernelDatabase - Database holding the kernel's persistent state.
   * @param options - Options for the kernel constructor.
   * @param options.resetStorage - If true, the storage will be cleared.
   * @param options.logger - Optional logger for error and diagnostic output.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor(
    commandStream: DuplexStream<JsonRpcCall, JsonRpcResponse>,
    platformServices: PlatformServices,
    kernelDatabase: KernelDatabase,
    options: {
      resetStorage?: boolean;
      logger?: Logger;
    } = {},
  ) {
    // XXX See #egregiousDebugHack below
    foolTheCompiler = 'nope';

    this.#commandStream = commandStream;
    this.#rpcService = new RpcService(kernelHandlers, {});
    this.#remotes = new Map();
    this.#remotesByPeer = new Map();
    this.#platformServices = platformServices;
    this.#logger = options.logger ?? new Logger('ocap-kernel');
    this.#kernelStore = makeKernelStore(kernelDatabase);
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

    this.#vatManager = new VatManager({
      platformServices,
      kernelStore: this.#kernelStore,
      kernelQueue: this.#kernelQueue,
      logger: this.#logger.subLogger({ tags: ['VatManager'] }),
    });

    this.#subclusterManager = new SubclusterManager({
      kernelStore: this.#kernelStore,
      kernelQueue: this.#kernelQueue,
      vatManager: this.#vatManager,
      getKernelService: (name) => this.#kernelServicesByName.get(name),
      queueMessage: this.queueMessage.bind(this),
    });

    this.#kernelRouter = new KernelRouter(
      this.#kernelStore,
      this.#kernelQueue,
      this.#getEndpoint.bind(this),
      this.#invokeKernelService.bind(this),
      this.#logger,
    );

    const ocapURLIssuerService = Far('serviceObject', {
      issue: async (obj: SlotValue): Promise<string> => {
        let kref: string;
        try {
          kref = krefOf(obj);
        } catch {
          throw Error(`argument must be a remotable`);
        }
        return await this.#issueOcapURL(kref);
      },
    });
    this.registerKernelServiceObject(
      'ocapURLIssuerService',
      ocapURLIssuerService,
    );

    const ocapURLRedemptionService = Far('serviceObject', {
      redeem: async (url: string): Promise<SlotValue> => {
        return kslot(await this.#redeemOcapURL(url));
      },
    });
    this.registerKernelServiceObject(
      'ocapURLRedemptionService',
      ocapURLRedemptionService,
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
   * @returns A promise for the new kernel instance.
   */
  static async make(
    commandStream: DuplexStream<JsonRpcCall, JsonRpcResponse>,
    platformServices: PlatformServices,
    kernelDatabase: KernelDatabase,
    options: {
      resetStorage?: boolean;
      logger?: Logger;
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

  async #handleRemoteMessage(from: string, message: string): Promise<string> {
    const remote = this.#remoteFor(from);
    return await remote.handleRemoteMessage(message);
  }

  /**
   * Start the kernel running. Sets it up to actually receive command messages
   * and then begin processing the run queue.
   */
  async #init(): Promise<void> {
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
   * Get the remote comms object.
   *
   * @returns the remote comms object.
   * @throws if the remote comms object is not initialized.
   */
  #getRemoteComms(): RemoteComms {
    if (this.#remoteComms) {
      return this.#remoteComms;
    }
    throw Error(`remote comms not initialized`);
  }

  /**
   * Initialize the remote comms object.
   *
   * @param relays - The relays to use for the remote comms object.
   * @returns a promise for the remote comms object.
   */
  async initRemoteComms(relays?: string[]): Promise<void> {
    this.#remoteComms = await initRemoteComms(
      this.#kernelStore,
      this.#platformServices,
      this.#handleRemoteMessage.bind(this),
      relays,
    );
  }

  /**
   * Send a message to a remote kernel.
   *
   * @param to - The peer ID of the remote kernel.
   * @param message - The message to send.
   * @param hints - Optional list of possible relays via which the requested peer might be contacted.
   *
   * @returns a promise for the result of the message send.
   */
  async sendRemoteMessage(
    to: string,
    message: string,
    hints: string[] = [],
  ): Promise<void> {
    await this.#getRemoteComms().sendRemoteMessage(to, message, hints);
  }

  /**
   * Redeem an ocap URL.
   *
   * @param url - The ocap URL to redeem.
   * @returns a promise for the kref of the object referenced by the ocap URL.
   */
  async #redeemOcapURL(url: string): Promise<string> {
    const { host, hints } = parseOcapURL(url);
    if (host === this.#getRemoteComms().getPeerId()) {
      return this.#getRemoteComms().redeemLocalOcapURL(url);
    }
    const remote = this.#remoteFor(host, hints);
    return remote.redeemOcapURL(url);
  }

  /**
   * Issue an ocap URL.
   *
   * @param kref - The kref of the object to issue an ocap URL for.
   * @returns a promise for the ocap URL.
   */
  async #issueOcapURL(kref: KRef): Promise<string> {
    return this.#getRemoteComms().issueOcapURL(kref);
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
   * Set up bookkeeping for a newly established remote connection.
   *
   * @param peerId - Peer ID of the kernel at the other end of the connection.
   * @param hints - Optional list of possible relays via which the requested peer might be contacted.
   *
   * @returns the RemoteHandle that was set up.
   */
  #establishRemote(peerId: string, hints: string[] = []): RemoteHandle {
    const remoteComms = this.#getRemoteComms();
    const remoteId = this.#kernelStore.getNextRemoteId();
    const remote = RemoteHandle.make({
      remoteId,
      peerId,
      kernelStore: this.#kernelStore,
      kernelQueue: this.#kernelQueue,
      remoteComms,
      locationHints: hints,
    });
    this.#remotes.set(remoteId, remote);
    this.#remotesByPeer.set(peerId, remote);
    return remote;
  }

  /**
   * Get or create a RemoteHandle for a given peer ID.
   *
   * @param peerId - The libp2p peer for which a handle is sought.
   * @param hints - Optional list of possible relays via which the requested peer might be contacted.
   *
   * @returns an existing or new RemoteHandle to communicate with `peerId`.
   */
  #remoteFor(peerId: string, hints: string[] = []): RemoteHandle {
    const remote =
      this.#remotesByPeer.get(peerId) ?? this.#establishRemote(peerId, hints);
    return remote;
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
   * @returns An array of subcluster information records.
   */
  getSubclusters(): Subcluster[] {
    return this.#subclusterManager.getSubclusters();
  }

  /**
   * Checks if a vat belongs to a specific subcluster.
   *
   * @param vatId - The ID of the vat to check.
   * @param subclusterId - The ID of the subcluster to check against.
   * @returns True if the vat belongs to the specified subcluster, false otherwise.
   */
  isVatInSubcluster(vatId: VatId, subclusterId: string): boolean {
    return this.#subclusterManager.isVatInSubcluster(vatId, subclusterId);
  }

  /**
   * Gets all vat IDs that belong to a specific subcluster.
   *
   * @param subclusterId - The ID of the subcluster to get vats for.
   * @returns An array of vat IDs that belong to the specified subcluster.
   */
  getSubclusterVats(subclusterId: string): VatId[] {
    return this.#subclusterManager.getSubclusterVats(subclusterId);
  }

  /**
   * Restarts a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns A promise for the restarted vat handle.
   */
  async restartVat(vatId: VatId): Promise<VatHandle> {
    return this.#vatManager.restartVat(vatId);
  }

  /**
   * Terminate a vat with extreme prejudice.
   *
   * @param vatId - The ID of the vat.
   * @param reason - If the vat is being terminated, the reason for the termination.
   * @returns A promise that resolves when the vat is terminated.
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

  #getEndpoint(endpointId: EndpointId): EndpointHandle {
    if (isVatId(endpointId)) {
      return this.#vatManager.getVat(endpointId);
    }
    if (isRemoteId(endpointId)) {
      return this.#getRemote(endpointId);
    }
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw Error(`invalid endpoint ID ${endpointId}`);
  }

  /**
   * Get a remote.
   *
   * @param remoteId - The ID of the remote.
   * @returns the remote's RemoteHandle.
   */
  #getRemote(remoteId: RemoteId): RemoteHandle {
    const remote = this.#remotes.get(remoteId);
    if (remote === undefined) {
      throw Error(`remote not found ${remoteId}`);
    }
    return remote;
  }

  /**
   * Gets a list of the IDs of all running vats.
   *
   * @returns An array of vat IDs.
   */
  getVatIds(): VatId[] {
    return this.#vatManager.getVatIds();
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
   * @returns The current kernel status containing vats and subclusters information.
   */
  async getStatus(): Promise<KernelStatus> {
    await this.#kernelQueue.waitForCrank();
    return {
      vats: this.getVats(),
      subclusters: this.#subclusterManager.getSubclusters(),
      remoteComms: this.#remoteComms
        ? {
            isInitialized: true,
            peerId: this.#remoteComms.getPeerId(),
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
   * @param vatId - The ID of the vat.
   * @returns The KRef of the vat root.
   */
  pinVatRoot(vatId: VatId): KRef {
    return this.#vatManager.pinVatRoot(vatId);
  }

  /**
   * Unpin a vat root.
   *
   * @param vatId - The ID of the vat.
   */
  unpinVatRoot(vatId: VatId): void {
    this.#vatManager.unpinVatRoot(vatId);
  }

  /**
   * Ping a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns A promise that resolves to the result of the ping.
   */
  async pingVat(vatId: VatId): Promise<PingVatResult> {
    return this.#vatManager.pingVat(vatId);
  }

  /**
   * Reset the kernel state.
   * This is for debugging purposes only.
   */
  #resetKernelState(): void {
    // XXX special case hack so that network address survives restart when testing
    const keySeed = this.#kernelStore.kv.get('keySeed');
    const peerId = this.#kernelStore.kv.get('peerId');
    const ocapURLKey = this.#kernelStore.kv.get('ocapURLKey');
    this.#kernelStore.clear();
    this.#kernelStore.reset();
    if (keySeed && peerId && ocapURLKey) {
      this.#kernelStore.kv.set('keySeed', keySeed);
      this.#kernelStore.kv.set('peerId', peerId);
      this.#kernelStore.kv.set('ocapURLKey', ocapURLKey);
    }
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

  async #egregiousDebugHack(): Promise<void> {
    if (this.#remoteComms) {
      // We deliberately use `let` rather than `const` for the URL string. It is
      // stored in a variable specifically to enable it to be modified in the
      // debugger.  Unfortunately, we have to jump through some hoops to prevent
      // the compiler's control flow analysis from removing it -- and the entire
      // subsequent `if` block that tests it! -- from the generated code. To
      // this end, the variable `foolTheCompiler` is defined as a global
      // initialized with one value and then deliberately and gratuitously
      // modified in the constructor to a different value, because TypeScript
      // lacks anything like a `volatile` declaration.

      // eslint-disable-next-line prefer-const
      let url: string = 'nope';
      // eslint-disable-next-line no-debugger
      debugger;

      if (url !== foolTheCompiler) {
        await this.queueMessage('ko3', 'doRunRun', [url]);
      }
    }
  }

  /**
   * Gracefully stop the kernel without deleting vats.
   */
  async stop(): Promise<void> {
    await this.#kernelQueue.waitForCrank();
    this.#logger.info('Stopping kernel gracefully...');
    await this.#commandStream.end();
    await this.#platformServices.terminateAll();
    this.#logger.info('Kernel stopped gracefully');
  }

  /**
   * Collect garbage.
   * This is for debugging purposes only.
   */
  collectGarbage(): void {
    this.#vatManager.collectGarbage();

    // XXX REMOVE THIS Stupid debug trick: In order to exercise the remote
    // connection machinery (in service of attempting to get said machinery to
    // actually work), we need a way during debugging to trigger the kernel to
    // try to set up and use a remote connection.  The control panel's 'Collect
    // Garbage' button turns out to be a super convenient one-click "hey kernel
    // please do something" hook to parasitize for this purpose.
    this.#egregiousDebugHack().catch(() => undefined);
  }

  registerKernelServiceObject(name: string, service: object): void {
    const serviceKey = `kernelService.${name}`;
    let kref = this.#kernelStore.kv.get(serviceKey);
    if (!kref) {
      kref = this.#kernelStore.initKernelObject('kernel');
      this.#kernelStore.kv.set(serviceKey, kref);
      this.#kernelStore.pinObject(kref);
    }
    const kernelService = { name, kref, service };
    this.#kernelServicesByName.set(name, kernelService);
    this.#kernelServicesByObject.set(kref, kernelService);
  }

  /**
   * Invoke a kernel service.
   *
   * @param target - The target of the service.
   * @param message - The message to invoke the service with.
   */
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
      const resultValue = await methodFunction.apply(service, args);
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
