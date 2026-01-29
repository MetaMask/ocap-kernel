import { calculateReconnectionBackoff } from '@metamask/kernel-utils';

/**
 * Default threshold for consecutive identical errors before marking as permanently failed.
 */
export const DEFAULT_CONSECUTIVE_ERROR_THRESHOLD = 5;

/**
 * Error codes that can indicate permanent failure when occurring consecutively.
 * These are network errors that suggest the peer is unreachable at the given address.
 */
export const PERMANENT_FAILURE_ERROR_CODES = new Set([
  'ECONNREFUSED', // Connection refused - peer not listening
  'EHOSTUNREACH', // No route to host - network path unavailable
  'ENOTFOUND', // DNS lookup failed - hostname doesn't resolve
  'ENETUNREACH', // Network unreachable
]);

export type ErrorRecord = {
  code: string;
  timestamp: number;
};

export type ReconnectionState = {
  isReconnecting: boolean;
  attemptCount: number; // completed attempts
  errorHistory: ErrorRecord[];
  permanentlyFailed: boolean;
};

/**
 * Reconnection state management for remote communications.
 * Handles reconnection attempts, backoff calculations, retry logic,
 * and permanent failure detection based on error patterns.
 */
export class ReconnectionManager {
  readonly #states = new Map<string, ReconnectionState>();

  readonly #consecutiveErrorThreshold: number;

  /**
   * Creates a new ReconnectionManager.
   *
   * @param options - Configuration options.
   * @param options.consecutiveErrorThreshold - Number of consecutive identical errors
   *   before marking a peer as permanently failed. Default is 5. Must be at least 1.
   */
  constructor(options?: { consecutiveErrorThreshold?: number }) {
    const threshold =
      options?.consecutiveErrorThreshold ?? DEFAULT_CONSECUTIVE_ERROR_THRESHOLD;
    if (threshold < 1) {
      throw new Error('consecutiveErrorThreshold must be at least 1');
    }
    this.#consecutiveErrorThreshold = threshold;
  }

  /**
   * Get or create reconnection state for a peer.
   *
   * @param peerId - The peer ID to get state for.
   * @returns The reconnection state.
   */
  #getState(peerId: string): ReconnectionState {
    let state = this.#states.get(peerId);
    if (!state) {
      state = {
        isReconnecting: false,
        attemptCount: 0,
        errorHistory: [],
        permanentlyFailed: false,
      };
      this.#states.set(peerId, state);
    }
    return state;
  }

  /**
   * Start reconnection for a peer.
   * Resets attempt count and error history when starting a new reconnection session.
   *
   * @param peerId - The peer ID to start reconnection for.
   * @returns False if the peer is permanently failed and reconnection should not proceed.
   */
  startReconnection(peerId: string): boolean {
    const state = this.#getState(peerId);

    // Don't start reconnection for permanently failed peers
    if (state.permanentlyFailed) {
      return false;
    }

    // Reset attempt count and error history when starting a new reconnection session
    // This allows retries after max attempts were previously exhausted
    if (!state.isReconnecting) {
      state.attemptCount = 0;
      state.errorHistory = [];
    }
    state.isReconnecting = true;
    return true;
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
   * Decrement the attempt count (minimum 0).
   * Used to "undo" an attempt that didn't actually perform a dial
   * (e.g., when rate-limited before the connection was attempted).
   *
   * @param peerId - The peer ID to decrement attempts for.
   */
  decrementAttempt(peerId: string): void {
    const state = this.#getState(peerId);
    if (state.attemptCount > 0) {
      state.attemptCount -= 1;
    }
  }

  /**
   * Reset the backoff counter and error history for a peer.
   * Called on successful communication to indicate the connection is working.
   * Clears error history to prevent stale errors from triggering false permanent failures.
   *
   * @param peerId - The peer ID to reset backoff for.
   */
  resetBackoff(peerId: string): void {
    const state = this.#getState(peerId);
    state.attemptCount = 0;
    state.errorHistory = [];
  }

  /**
   * Calculate the backoff delay for the next attempt.
   *
   * @param peerId - The peer ID to calculate backoff for.
   * @returns The backoff delay in milliseconds.
   */
  calculateBackoff(peerId: string): number {
    const state = this.#getState(peerId);
    return calculateReconnectionBackoff(state.attemptCount);
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
   * Reset all backoffs and error histories (e.g., after wake from sleep).
   * Clears error histories because network conditions have changed and old errors
   * are no longer relevant for permanent failure detection.
   */
  resetAllBackoffs(): void {
    for (const state of this.#states.values()) {
      if (state.isReconnecting) {
        state.attemptCount = 0;
        state.errorHistory = [];
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

  /**
   * Record an error that occurred during reconnection.
   * This updates the error history and checks for permanent failure patterns.
   * Error history is capped at the consecutive error threshold to prevent unbounded growth.
   *
   * @param peerId - The peer ID that experienced the error.
   * @param errorCode - The error code (e.g., 'ECONNREFUSED', 'ETIMEDOUT').
   */
  recordError(peerId: string, errorCode: string): void {
    const state = this.#getState(peerId);
    state.errorHistory.push({
      code: errorCode,
      timestamp: Date.now(),
    });

    // Cap error history to prevent unbounded memory growth
    // We only need the last N errors for pattern detection
    if (state.errorHistory.length > this.#consecutiveErrorThreshold) {
      state.errorHistory = state.errorHistory.slice(
        -this.#consecutiveErrorThreshold,
      );
    }

    // Check for permanent failure pattern
    this.#checkPermanentFailure(peerId);
  }

  /**
   * Check if a peer has been marked as permanently failed.
   *
   * @param peerId - The peer ID to check.
   * @returns True if the peer is permanently failed.
   */
  isPermanentlyFailed(peerId: string): boolean {
    return this.#getState(peerId).permanentlyFailed;
  }

  /**
   * Clear the permanent failure status for a peer.
   * Call this when manually requesting reconnection to a previously failed peer.
   *
   * @param peerId - The peer ID to clear permanent failure for.
   */
  clearPermanentFailure(peerId: string): void {
    const state = this.#getState(peerId);
    state.permanentlyFailed = false;
    state.errorHistory = [];
  }

  /**
   * Get the error history for a peer.
   *
   * @param peerId - The peer ID to get error history for.
   * @returns The error history array.
   */
  getErrorHistory(peerId: string): readonly ErrorRecord[] {
    return this.#getState(peerId).errorHistory;
  }

  /**
   * Check if recent errors indicate permanent failure and update state accordingly.
   *
   * Permanent failure is detected when:
   * - The last N errors (where N = consecutiveErrorThreshold) have the same error code
   * - AND that error code is in the PERMANENT_FAILURE_ERROR_CODES set
   *
   * @param peerId - The peer ID to check.
   */
  #checkPermanentFailure(peerId: string): void {
    const state = this.#getState(peerId);
    const { errorHistory } = state;

    if (errorHistory.length < this.#consecutiveErrorThreshold) {
      return;
    }

    // Get the last N errors
    const recentErrors = errorHistory.slice(-this.#consecutiveErrorThreshold);
    const firstCode = recentErrors[0]?.code;

    if (!firstCode) {
      return;
    }

    // Check if all recent errors have the same code
    const allSameCode = recentErrors.every((error) => error.code === firstCode);

    // Check if this error code indicates permanent failure
    if (allSameCode && PERMANENT_FAILURE_ERROR_CODES.has(firstCode)) {
      state.permanentlyFailed = true;
    }
  }
}
