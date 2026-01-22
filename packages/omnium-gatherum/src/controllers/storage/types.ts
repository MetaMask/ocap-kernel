import type { Json } from '@metamask/utils';

/**
 * Low-level storage adapter interface.
 * Wraps platform-specific storage APIs (e.g., chrome.storage.local).
 */
export type StorageAdapter = {
  /**
   * Get a value from storage.
   *
   * @param key - The storage key.
   * @returns The stored value, or undefined if not found.
   */
  get: <Value extends Json>(key: string) => Promise<Value | undefined>;

  /**
   * Set a value in storage.
   *
   * @param key - The storage key.
   * @param value - The value to store.
   */
  set: (key: string, value: Json) => Promise<void>;

  /**
   * Delete a value from storage.
   *
   * @param key - The storage key.
   */
  delete: (key: string) => Promise<void>;

  /**
   * Get all keys matching a prefix.
   *
   * @param prefix - Optional prefix to filter keys.
   * @returns Array of matching keys.
   */
  keys: (prefix?: string) => Promise<string[]>;
};
