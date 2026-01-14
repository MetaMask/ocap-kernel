import { MessageQueue } from './message-queue.ts';
import type { Channel } from '../types.ts';

/**
 * Manages per-peer state including channels, message queues, location hints,
 * and connection tracking.
 */
export class PeerRegistry {
  /** Currently active channels, by peer ID */
  readonly #channels = new Map<string, Channel>();

  /** Per-peer message queues for when connections are unavailable */
  readonly #messageQueues = new Map<string, MessageQueue>();

  /** Peers that have been intentionally closed (don't auto-reconnect) */
  readonly #intentionallyClosed = new Set<string>();

  /** Last connection/activity time per peer for stale cleanup */
  readonly #lastConnectionTime = new Map<string, number>();

  /** Location hints (multiaddrs) per peer */
  readonly #locationHints = new Map<string, string[]>();

  /** Maximum messages to queue per peer */
  readonly #maxQueue: number;

  /**
   * Create a new PeerRegistry.
   *
   * @param maxQueue - Maximum number of messages to queue per peer.
   */
  constructor(maxQueue: number) {
    this.#maxQueue = maxQueue;
  }

  /**
   * Get the channel for a peer.
   *
   * @param peerId - The peer ID.
   * @returns The channel, or undefined if not connected.
   */
  getChannel(peerId: string): Channel | undefined {
    return this.#channels.get(peerId);
  }

  /**
   * Check if a peer has an active channel.
   *
   * @param peerId - The peer ID.
   * @returns True if the peer has a channel.
   */
  hasChannel(peerId: string): boolean {
    return this.#channels.has(peerId);
  }

  /**
   * Set the channel for a peer.
   *
   * @param peerId - The peer ID.
   * @param channel - The channel to set.
   * @returns The previous channel if one existed.
   */
  setChannel(peerId: string, channel: Channel): Channel | undefined {
    const previous = this.#channels.get(peerId);
    this.#channels.set(peerId, channel);
    this.#lastConnectionTime.set(peerId, Date.now());
    return previous;
  }

  /**
   * Remove the channel for a peer.
   *
   * @param peerId - The peer ID.
   * @returns True if a channel was removed.
   */
  removeChannel(peerId: string): boolean {
    return this.#channels.delete(peerId);
  }

  /**
   * Get the number of active channels.
   *
   * @returns The number of active channels.
   */
  get channelCount(): number {
    return this.#channels.size;
  }

  /**
   * Get or create a message queue for a peer.
   *
   * @param peerId - The peer ID.
   * @returns The message queue.
   */
  getMessageQueue(peerId: string): MessageQueue {
    let queue = this.#messageQueues.get(peerId);
    if (!queue) {
      queue = new MessageQueue(this.#maxQueue);
      this.#messageQueues.set(peerId, queue);
      if (!this.#lastConnectionTime.has(peerId)) {
        this.#lastConnectionTime.set(peerId, Date.now());
      }
    }
    return queue;
  }

  /**
   * Check if a peer is marked as intentionally closed.
   *
   * @param peerId - The peer ID.
   * @returns True if intentionally closed.
   */
  isIntentionallyClosed(peerId: string): boolean {
    return this.#intentionallyClosed.has(peerId);
  }

  /**
   * Mark a peer as intentionally closed.
   *
   * @param peerId - The peer ID.
   */
  markIntentionallyClosed(peerId: string): void {
    this.#intentionallyClosed.add(peerId);
  }

  /**
   * Clear the intentionally closed flag for a peer.
   *
   * @param peerId - The peer ID.
   */
  clearIntentionallyClosed(peerId: string): void {
    this.#intentionallyClosed.delete(peerId);
  }

  /**
   * Update the last connection time for a peer.
   *
   * @param peerId - The peer ID.
   */
  updateLastConnectionTime(peerId: string): void {
    this.#lastConnectionTime.set(peerId, Date.now());
  }

  /**
   * Get location hints for a peer.
   *
   * @param peerId - The peer ID.
   * @returns The location hints, or an empty array.
   */
  getLocationHints(peerId: string): string[] {
    return this.#locationHints.get(peerId) ?? [];
  }

  /**
   * Register location hints for a peer, merging with existing hints.
   *
   * @param peerId - The peer ID.
   * @param hints - The hints to add.
   */
  registerLocationHints(peerId: string, hints: string[]): void {
    const oldHints = this.#locationHints.get(peerId);
    if (oldHints) {
      const newHints = new Set(oldHints);
      for (const hint of hints) {
        newHints.add(hint);
      }
      this.#locationHints.set(peerId, Array.from(newHints));
    } else {
      this.#locationHints.set(peerId, Array.from(hints));
    }
  }

  /**
   * Find stale peers that should be cleaned up.
   *
   * @param stalePeerTimeoutMs - Time in ms before a peer is considered stale.
   * @param isReconnecting - Function to check if a peer is reconnecting.
   * @returns Array of stale peer IDs.
   */
  findStalePeers(
    stalePeerTimeoutMs: number,
    isReconnecting: (peerId: string) => boolean,
  ): string[] {
    const now = Date.now();
    const stalePeers: string[] = [];

    for (const [peerId, lastTime] of this.#lastConnectionTime.entries()) {
      const timeSinceLastActivity = now - lastTime;
      const hasActiveChannel = this.#channels.has(peerId);
      const reconnecting = isReconnecting(peerId);

      if (
        !hasActiveChannel &&
        !reconnecting &&
        timeSinceLastActivity > stalePeerTimeoutMs
      ) {
        stalePeers.push(peerId);
      }
    }

    return stalePeers;
  }

  /**
   * Get the last connection time for a peer.
   *
   * @param peerId - The peer ID.
   * @returns The last connection time, or undefined.
   */
  getLastConnectionTime(peerId: string): number | undefined {
    return this.#lastConnectionTime.get(peerId);
  }

  /**
   * Remove all state for a peer.
   *
   * @param peerId - The peer ID.
   */
  removePeer(peerId: string): void {
    this.#channels.delete(peerId);
    this.#messageQueues.delete(peerId);
    this.#intentionallyClosed.delete(peerId);
    this.#lastConnectionTime.delete(peerId);
    this.#locationHints.delete(peerId);
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.#channels.clear();
    this.#messageQueues.clear();
    this.#intentionallyClosed.clear();
    this.#lastConnectionTime.clear();
    this.#locationHints.clear();
  }
}
