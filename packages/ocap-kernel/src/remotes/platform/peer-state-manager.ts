import type { Logger } from '@metamask/logger';

import { DEFAULT_STALE_PEER_TIMEOUT_MS } from './constants.ts';
import type { Channel } from '../types.ts';

/**
 * Per-peer connection state.
 */
export type PeerState = {
  channel: Channel | undefined;
  locationHints: string[];
};

/**
 * Manages peer connection state, tracking channels, location hints,
 * connection times, and intentional closures.
 */
export class PeerStateManager {
  readonly #peerStates = new Map<string, PeerState>();

  readonly #lastConnectionTime = new Map<string, number>();

  readonly #intentionallyClosed = new Set<string>();

  readonly #logger: Logger;

  readonly #stalePeerTimeoutMs: number;

  /**
   * Create a new PeerStateManager.
   *
   * @param logger - Logger instance for logging.
   * @param stalePeerTimeoutMs - Timeout for stale peer cleanup.
   */
  constructor(
    logger: Logger,
    stalePeerTimeoutMs = DEFAULT_STALE_PEER_TIMEOUT_MS,
  ) {
    this.#logger = logger;
    this.#stalePeerTimeoutMs = stalePeerTimeoutMs;
  }

  /**
   * Get or create peer connection state.
   *
   * @param peerId - The peer ID.
   * @returns The peer connection state.
   */
  getState(peerId: string): PeerState {
    let state = this.#peerStates.get(peerId);
    if (!state) {
      state = { channel: undefined, locationHints: [] };
      this.#peerStates.set(peerId, state);
      // Initialize lastConnectionTime to enable stale peer cleanup
      // even for peers that never successfully connect
      if (!this.#lastConnectionTime.has(peerId)) {
        this.#lastConnectionTime.set(peerId, Date.now());
      }
    }
    return state;
  }

  /**
   * Count the number of active connections (peers with channels).
   *
   * @returns The number of active connections.
   */
  countActiveConnections(): number {
    let count = 0;
    for (const state of this.#peerStates.values()) {
      if (state.channel) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Update the last connection time for a peer.
   *
   * @param peerId - The peer ID.
   */
  updateConnectionTime(peerId: string): void {
    this.#lastConnectionTime.set(peerId, Date.now());
  }

  /**
   * Check if a peer was intentionally closed.
   *
   * @param peerId - The peer ID.
   * @returns True if the peer was intentionally closed.
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
   * Clear the intentional close flag for a peer.
   *
   * @param peerId - The peer ID.
   */
  clearIntentionallyClosed(peerId: string): void {
    this.#intentionallyClosed.delete(peerId);
  }

  /**
   * Register location hints for a peer.
   *
   * @param peerId - The peer ID.
   * @param hints - Location hints to add.
   */
  addLocationHints(peerId: string, hints: string[]): void {
    const state = this.getState(peerId);
    const { locationHints: oldHints } = state;
    if (oldHints.length > 0) {
      const newHints = new Set(oldHints);
      for (const hint of hints) {
        newHints.add(hint);
      }
      state.locationHints = Array.from(newHints);
    } else {
      state.locationHints = Array.from(hints);
    }
  }

  /**
   * Get stale peers that should be cleaned up.
   * A peer is considered stale if:
   * - It has no active channel
   * - It has been inactive for more than stalePeerTimeoutMs
   *
   * @returns Array of peer IDs that are stale.
   */
  getStalePeers(): string[] {
    const now = Date.now();
    const stalePeers: string[] = [];

    for (const [peerId, lastTime] of this.#lastConnectionTime.entries()) {
      const state = this.#peerStates.get(peerId);
      const timeSinceLastActivity = now - lastTime;

      if (!state?.channel && timeSinceLastActivity > this.#stalePeerTimeoutMs) {
        stalePeers.push(peerId);
      }
    }

    return stalePeers;
  }

  /**
   * Remove a peer from all tracking state.
   *
   * @param peerId - The peer ID to remove.
   */
  removePeer(peerId: string): void {
    const lastTime = this.#lastConnectionTime.get(peerId);
    this.#logger.log(
      `Cleaning up stale peer ${peerId} (inactive for ${lastTime ? Date.now() - lastTime : 'unknown'}ms)`,
    );
    this.#peerStates.delete(peerId);
    this.#intentionallyClosed.delete(peerId);
    this.#lastConnectionTime.delete(peerId);
  }

  /**
   * Get all peer states for iteration.
   *
   * @returns Iterator over all peer states.
   */
  getAllStates(): IterableIterator<PeerState> {
    return this.#peerStates.values();
  }

  /**
   * Clear all state. Called during stop().
   */
  clear(): void {
    this.#peerStates.clear();
    this.#intentionallyClosed.clear();
    this.#lastConnectionTime.clear();
  }
}
