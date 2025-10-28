import { calculateReconnectionBackoff } from '@metamask/kernel-utils';

export type ReconnectionState = {
  isReconnecting: boolean;
  attemptCount: number; // completed attempts
};

/**
 * Reconnection state management for remote communications.
 * Handles reconnection attempts, backoff calculations, and retry logic.
 */
export class ReconnectionManager {
  readonly #states = new Map<string, ReconnectionState>();

  /**
   * Get or create reconnection state for a peer.
   *
   * @param peerId - The peer ID to get state for.
   * @returns The reconnection state.
   */
  #getState(peerId: string): ReconnectionState {
    let state = this.#states.get(peerId);
    if (!state) {
      state = { isReconnecting: false, attemptCount: 0 };
      this.#states.set(peerId, state);
    }
    return state;
  }

  /**
   * Start reconnection for a peer.
   *
   * @param peerId - The peer ID to start reconnection for.
   */
  startReconnection(peerId: string): void {
    const state = this.#getState(peerId);
    state.isReconnecting = true;
  }

  /**
   * Stop reconnection for a peer.
   *
   * @param peerId - The peer ID to stop reconnection for.
   */
  stopReconnection(peerId: string): void {
    const state = this.#getState(peerId);
    state.isReconnecting = false;
  }

  /**
   * Check if a peer is currently reconnecting.
   *
   * @param peerId - The peer ID to check.
   * @returns True if the peer is reconnecting.
   */
  isReconnecting(peerId: string): boolean {
    return this.#getState(peerId).isReconnecting;
  }

  /**
   * Increment the attempt count and return the new count.
   *
   * @param peerId - The peer ID to increment attempts for.
   * @returns The new attempt count.
   */
  incrementAttempt(peerId: string): number {
    const state = this.#getState(peerId);
    state.attemptCount += 1;
    return state.attemptCount;
  }

  /**
   * Reset the backoff counter for a peer.
   *
   * @param peerId - The peer ID to reset backoff for.
   */
  resetBackoff(peerId: string): void {
    this.#getState(peerId).attemptCount = 0;
  }

  /**
   * Calculate the backoff delay for the next attempt.
   *
   * @param peerId - The peer ID to calculate backoff for.
   * @returns The backoff delay in milliseconds.
   */
  calculateBackoff(peerId: string): number {
    const state = this.#getState(peerId);
    return calculateReconnectionBackoff(state.attemptCount + 1);
  }

  /**
   * Check if we should retry based on max attempts.
   *
   * @param peerId - The peer ID to check.
   * @param maxAttempts - Maximum number of attempts. 0 means infinite.
   * @returns True if we should retry.
   */
  shouldRetry(peerId: string, maxAttempts: number): boolean {
    if (maxAttempts === 0) {
      return true; // Infinite retries
    }
    const state = this.#getState(peerId);
    return state.attemptCount < maxAttempts;
  }

  /**
   * Get the current attempt count for a peer.
   *
   * @param peerId - The peer ID to get attempt count for.
   * @returns The current attempt count.
   */
  getAttemptCount(peerId: string): number {
    return this.#getState(peerId).attemptCount;
  }

  /**
   * Reset all backoffs (e.g., after wake from sleep).
   */
  resetAllBackoffs(): void {
    for (const state of this.#states.values()) {
      if (state.isReconnecting) {
        state.attemptCount = 0;
      }
    }
  }

  /**
   * Clear all reconnection states.
   */
  clear(): void {
    this.#states.clear();
  }

  /**
   * Clear state for a specific peer.
   *
   * @param peerId - The peer ID to clear state for.
   */
  clearPeer(peerId: string): void {
    this.#states.delete(peerId);
  }
}
