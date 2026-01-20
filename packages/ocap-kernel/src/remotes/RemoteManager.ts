import type { Logger } from '@metamask/logger';

import type { KernelQueue } from '../KernelQueue.ts';
import { kser } from '../liveslots/kernel-marshal.ts';
import type { PlatformServices, RemoteId } from '../types.ts';
import { initRemoteComms } from './remote-comms.ts';
import { RemoteHandle } from './RemoteHandle.ts';
import type {
  RemoteComms,
  RemoteMessageHandler,
  RemoteInfo,
  RemoteCommsOptions,
} from './types.ts';
import type { KernelStore } from '../store/index.ts';

type RemoteManagerConstructorProps = {
  platformServices: PlatformServices;
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  logger?: Logger;
  keySeed?: string | undefined;
};

/**
 * Manages remote kernel connections and communications.
 */
export class RemoteManager {
  /** Currently active remote kernel connections, by ID */
  readonly #remotes: Map<RemoteId, RemoteHandle> = new Map();

  /** Currently active remote kernel connections, by remote Peer ID */
  readonly #remotesByPeer: Map<string, RemoteHandle> = new Map();

  /** Platform services for network operations */
  readonly #platformServices: PlatformServices;

  /** Storage holding the kernel's persistent state */
  readonly #kernelStore: KernelStore;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** Logger for outputting messages to the console */
  readonly #logger: Logger | undefined;

  /** Optional seed string for libp2p key generation */
  readonly #keySeed: string | undefined;

  /** Remote communications interface */
  #remoteComms: RemoteComms | undefined;

  /** Handler for incoming remote messages */
  #messageHandler: RemoteMessageHandler | undefined;

  /**
   * Creates a new RemoteManager instance.
   *
   * @param options - Constructor options.
   * @param options.platformServices - Platform-specific services for network communication.
   * @param options.kernelStore - The kernel's persistent state store.
   * @param options.kernelQueue - The kernel's message queue for scheduling deliveries.
   * @param options.logger - Logger instance for debugging and diagnostics.
   * @param options.keySeed - Seed for generating the kernel's cryptographic key pair.
   */
  constructor({
    platformServices,
    kernelStore,
    kernelQueue,
    logger,
    keySeed,
  }: RemoteManagerConstructorProps) {
    this.#platformServices = platformServices;
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#logger = logger;
    this.#keySeed = keySeed;
  }

  /**
   * Set the message handler for incoming remote messages.
   * This should be called during initialization to properly wire up message handling.
   *
   * @param handler - The function to handle incoming remote messages
   */
  setMessageHandler(handler: RemoteMessageHandler): void {
    this.#messageHandler = handler;
  }

  /**
   * Handle when we give up on a remote (after max retries or non-retryable error).
   * Rejects all promises for which this remote is the decider.
   *
   * @param peerId - The peer ID of the remote we're giving up on.
   */
  #handleRemoteGiveUp(peerId: string): void {
    // Find the RemoteId for this peerId
    const remote = this.#remotesByPeer.get(peerId);
    if (!remote) {
      // Remote not found - might have been cleaned up already
      return;
    }

    const { remoteId } = remote;
    const failure = kser(
      Error(
        `Remote connection lost: ${peerId} (max retries reached or non-retryable error)`,
      ),
    );

    // Reject pending URL redemptions in the RemoteHandle
    // These are JavaScript promises that will propagate rejection to kernel promises
    remote.rejectPendingRedemptions(
      `Remote connection lost: ${peerId} (max retries reached or non-retryable error)`,
    );

    // Reject all promises for which this remote is the decider
    for (const kpid of this.#kernelStore.getPromisesByDecider(remoteId)) {
      this.#kernelQueue.resolvePromises(remoteId, [[kpid, true, failure]]);
    }
  }

  /**
   * Initialize the remote comms object at kernel startup.
   *
   * @param options - Options for remote communications initialization.
   * @returns a promise that resolves when initialization is complete.
   */
  async initRemoteComms(options?: RemoteCommsOptions): Promise<void> {
    if (!this.#messageHandler) {
      throw Error(
        'Message handler must be set before initializing remote comms',
      );
    }

    this.#remoteComms = await initRemoteComms(
      this.#kernelStore,
      this.#platformServices,
      this.#messageHandler,
      options ?? {},
      this.#logger,
      this.#keySeed,
      this.#handleRemoteGiveUp.bind(this),
    );

    // Restore all remotes that were previously established
    for (const {
      remoteId,
      remoteInfo,
    } of this.#kernelStore.getAllRemoteRecords()) {
      this.#initializeRemote(remoteId, remoteInfo);
    }
  }

  /**
   * Clean up remote manager state.
   * This should be called when remote comms are stopped externally.
   */
  cleanup(): void {
    // Clean up all RemoteHandle instances to clear their timers
    for (const remote of this.#remotes.values()) {
      remote.cleanup();
    }
    this.#remoteComms = undefined;
    this.#remotes.clear();
    this.#remotesByPeer.clear();
  }

  /**
   * Get the remote comms object.
   *
   * @returns the remote comms object.
   * @throws if the remote comms object is not initialized.
   */
  getRemoteComms(): RemoteComms {
    if (this.#remoteComms) {
      return this.#remoteComms;
    }
    throw Error('Remote comms not initialized');
  }

  /**
   * Check if remote comms is initialized.
   *
   * @returns true if remote comms is initialized, false otherwise.
   */
  isRemoteCommsInitialized(): boolean {
    return this.#remoteComms !== undefined;
  }

  /**
   * Get the peer ID of this kernel.
   *
   * @returns the peer ID.
   * @throws if remote comms is not initialized.
   */
  getPeerId(): string {
    return this.getRemoteComms().getPeerId();
  }

  /**
   * Set up bookkeeping for a newly established remote connection.
   *
   * @param peerId - Peer ID of the kernel at the other end of the connection.
   * @param hints - Optional list of possible relays via which the requested peer might be contacted.
   * @returns the RemoteHandle that was set up.
   */
  establishRemote(peerId: string, hints: string[] = []): RemoteHandle {
    const remoteId = this.#kernelStore.getNextRemoteId();
    const remoteInfo: RemoteInfo = { peerId, hints };
    const remote = this.#initializeRemote(remoteId, remoteInfo);
    this.#kernelStore.setRemoteInfo(remoteId, remoteInfo);
    this.#kernelStore.initEndpoint(remoteId);
    return remote;
  }

  /**
   * Initializes a remote handle for communication with a remote kernel.
   *
   * @param remoteId - The unique identifier for the remote kernel.
   * @param info - Information about the remote including peer ID and connection hints.
   * @returns A handle for communicating with the remote kernel.
   */
  #initializeRemote(remoteId: RemoteId, info: RemoteInfo): RemoteHandle {
    const { peerId, hints } = info;
    const remoteComms = this.getRemoteComms();

    const remote = RemoteHandle.make({
      remoteId,
      peerId,
      kernelStore: this.#kernelStore,
      kernelQueue: this.#kernelQueue,
      remoteComms,
      locationHints: hints,
      logger: this.#logger,
      onGiveUp: this.#handleRemoteGiveUp.bind(this),
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
  remoteFor(peerId: string, hints: string[] = []): RemoteHandle {
    const remote =
      this.#remotesByPeer.get(peerId) ?? this.establishRemote(peerId, hints);
    return remote;
  }

  /**
   * Get a remote by its ID.
   *
   * @param remoteId - The ID of the remote.
   * @returns the remote's RemoteHandle.
   * @throws if the remote is not found.
   */
  getRemote(remoteId: RemoteId): RemoteHandle {
    const remote = this.#remotes.get(remoteId);
    if (remote === undefined) {
      throw Error(`Remote not found: ${remoteId}`);
    }
    return remote;
  }

  /**
   * Handle a message from a remote kernel.
   *
   * @param from - The peer ID of the sender.
   * @param message - The message content.
   * @returns a promise for the response message.
   */
  async handleRemoteMessage(from: string, message: string): Promise<string> {
    const remote = this.remoteFor(from);
    return await remote.handleRemoteMessage(message);
  }

  /**
   * Explicitly close a connection to a peer.
   * Marks the peer as intentionally closed to prevent automatic reconnection.
   *
   * @param peerId - The peer ID to close the connection for.
   */
  async closeConnection(peerId: string): Promise<void> {
    this.getRemoteComms(); // Ensure remote comms is initialized
    await this.#platformServices.closeConnection(peerId);
  }

  /**
   * Take note of where a peer might be.
   *
   * @param peerId - The peer ID to which this information applies.
   * @param hints - Location hints for the peer.
   */
  async registerLocationHints(peerId: string, hints: string[]): Promise<void> {
    await this.getRemoteComms().registerLocationHints(peerId, hints);
  }

  /**
   * Manually reconnect to a peer after intentional close.
   * Clears the intentional close flag and initiates reconnection.
   *
   * @param peerId - The peer ID to reconnect to.
   * @param hints - Optional hints for reconnection.
   */
  async reconnectPeer(peerId: string, hints: string[] = []): Promise<void> {
    this.getRemoteComms(); // Ensure remote comms is initialized
    await this.#platformServices.reconnectPeer(peerId, hints);
  }
}
