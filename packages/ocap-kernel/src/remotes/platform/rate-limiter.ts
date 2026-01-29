import { ResourceLimitError } from '@metamask/kernel-errors';

import {
  DEFAULT_CONNECTION_RATE_LIMIT,
  DEFAULT_CONNECTION_RATE_WINDOW_MS,
  DEFAULT_MESSAGE_RATE_LIMIT,
  DEFAULT_MESSAGE_RATE_WINDOW_MS,
} from './constants.ts';

/**
 * A sliding window rate limiter that tracks event counts per key within a time window.
 * Events older than the window are automatically pruned when checking or recording.
 */
export class SlidingWindowRateLimiter {
  readonly #maxEvents: number;

  readonly #windowMs: number;

  readonly #timestamps: Map<string, number[]>;

  /**
   * Create a new sliding window rate limiter.
   *
   * @param maxEvents - Maximum number of events allowed within the window.
   * @param windowMs - Window size in milliseconds.
   * @throws Error if maxEvents or windowMs is not a positive finite number.
   */
  constructor(maxEvents: number, windowMs: number) {
    if (!Number.isFinite(maxEvents) || maxEvents <= 0) {
      throw new Error('maxEvents must be a positive finite number');
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error('windowMs must be a positive finite number');
    }
    this.#maxEvents = maxEvents;
    this.#windowMs = windowMs;
    this.#timestamps = new Map();
  }

  /**
   * Check if an event would exceed the rate limit for a given key.
   * This does not record the event.
   *
   * @param key - The key to check (e.g., peer ID).
   * @returns True if the event would exceed the rate limit.
   */
  wouldExceedLimit(key: string): boolean {
    return this.getCurrentCount(key) >= this.#maxEvents;
  }

  /**
   * Record an event for a given key.
   * Automatically prunes old timestamps outside the window.
   *
   * @param key - The key to record (e.g., peer ID).
   */
  recordEvent(key: string): void {
    const now = Date.now();
    const cutoff = now - this.#windowMs;
    let timestamps = this.#timestamps.get(key);

    if (!timestamps) {
      timestamps = [];
      this.#timestamps.set(key, timestamps);
    }

    // Prune old timestamps and add new one
    const pruned = timestamps.filter((ts) => ts > cutoff);
    pruned.push(now);
    this.#timestamps.set(key, pruned);
  }

  /**
   * Check the rate limit and record the event if allowed.
   * Throws ResourceLimitError if the limit would be exceeded.
   *
   * @param key - The key to check and record (e.g., peer ID).
   * @param limitType - The type of limit for error reporting.
   * @throws ResourceLimitError if the rate limit would be exceeded.
   */
  checkAndRecord(
    key: string,
    limitType: 'messageRate' | 'connectionRate',
  ): void {
    const currentCount = this.getCurrentCount(key);
    if (currentCount >= this.#maxEvents) {
      throw new ResourceLimitError(
        `Rate limit exceeded: ${currentCount}/${this.#maxEvents} ${limitType} in ${this.#windowMs}ms window`,
        {
          data: {
            limitType,
            current: currentCount,
            limit: this.#maxEvents,
          },
        },
      );
    }
    this.recordEvent(key);
  }

  /**
   * Get the current count of events within the window for a key.
   *
   * @param key - The key to check.
   * @returns The number of events within the current window.
   */
  getCurrentCount(key: string): number {
    const now = Date.now();
    const cutoff = now - this.#windowMs;
    const timestamps = this.#timestamps.get(key);

    if (!timestamps) {
      return 0;
    }

    return timestamps.filter((ts) => ts > cutoff).length;
  }

  /**
   * Clear all recorded events for a specific key.
   *
   * @param key - The key to clear.
   */
  clearKey(key: string): void {
    this.#timestamps.delete(key);
  }

  /**
   * Clear all recorded events.
   */
  clear(): void {
    this.#timestamps.clear();
  }

  /**
   * Prune old timestamps for all keys.
   * Removes keys that have no recent events.
   */
  pruneStale(): void {
    const now = Date.now();
    const cutoff = now - this.#windowMs;

    for (const [key, timestamps] of this.#timestamps.entries()) {
      const pruned = timestamps.filter((ts) => ts > cutoff);
      if (pruned.length === 0) {
        this.#timestamps.delete(key);
      } else {
        this.#timestamps.set(key, pruned);
      }
    }
  }
}

/**
 * Factory function to create a message rate limiter.
 *
 * @param maxMessagesPerSecond - Maximum messages per second per peer.
 * @returns A configured SlidingWindowRateLimiter for message rate limiting.
 */
export function makeMessageRateLimiter(
  maxMessagesPerSecond: number = DEFAULT_MESSAGE_RATE_LIMIT,
): SlidingWindowRateLimiter {
  return new SlidingWindowRateLimiter(
    maxMessagesPerSecond,
    DEFAULT_MESSAGE_RATE_WINDOW_MS,
  );
}

/**
 * Factory function to create a connection attempt rate limiter.
 *
 * @param maxAttemptsPerMinute - Maximum connection attempts per minute per peer.
 * @returns A configured SlidingWindowRateLimiter for connection rate limiting.
 */
export function makeConnectionRateLimiter(
  maxAttemptsPerMinute: number = DEFAULT_CONNECTION_RATE_LIMIT,
): SlidingWindowRateLimiter {
  return new SlidingWindowRateLimiter(
    maxAttemptsPerMinute,
    DEFAULT_CONNECTION_RATE_WINDOW_MS,
  );
}
