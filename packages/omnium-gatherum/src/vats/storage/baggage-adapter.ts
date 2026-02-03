import type { Json } from '@metamask/utils';

import type { StorageAdapter } from '../../controllers/storage/types.ts';

/**
 * Baggage interface from liveslots.
 * Baggage provides durable storage for vat state.
 */
type Baggage = {
  has: (key: string) => boolean;
  get: (key: string) => unknown;
  init: (key: string, value: unknown) => void;
  set: (key: string, value: unknown) => void;
};

const KEYS_KEY = '__storage_keys__';

/**
 * Create a StorageAdapter implementation backed by vat baggage.
 * Provides synchronous persistence (baggage writes are durable).
 *
 * Since baggage doesn't support key enumeration directly, we track
 * stored keys in a separate baggage entry.
 *
 * @param baggage - The vat baggage store.
 * @returns A StorageAdapter backed by baggage.
 */
export function makeBaggageStorageAdapter(baggage: Baggage): StorageAdapter {
  /**
   * Get all tracked storage keys.
   *
   * @returns The set of tracked keys.
   */
  const getKeys = (): Set<string> => {
    if (baggage.has(KEYS_KEY)) {
      return new Set(baggage.get(KEYS_KEY) as string[]);
    }
    return new Set();
  };

  /**
   * Save the set of tracked keys to baggage.
   *
   * @param keys - The set of keys to save.
   */
  const saveKeys = (keys: Set<string>): void => {
    const arr = Array.from(keys);
    if (baggage.has(KEYS_KEY)) {
      baggage.set(KEYS_KEY, harden(arr));
    } else {
      baggage.init(KEYS_KEY, harden(arr));
    }
  };

  return harden({
    async get<Value extends Json>(key: string): Promise<Value | undefined> {
      if (baggage.has(key)) {
        return baggage.get(key) as Value;
      }
      return undefined;
    },

    async set(key: string, value: Json): Promise<void> {
      const keys = getKeys();
      if (baggage.has(key)) {
        baggage.set(key, harden(value));
      } else {
        baggage.init(key, harden(value));
        keys.add(key);
        saveKeys(keys);
      }
    },

    async delete(key: string): Promise<void> {
      // Baggage doesn't support true deletion, so we set to null marker
      if (baggage.has(key)) {
        baggage.set(key, harden(null));
        const keys = getKeys();
        keys.delete(key);
        saveKeys(keys);
      }
    },

    async keys(prefix?: string): Promise<string[]> {
      const allKeys = getKeys();
      if (!prefix) {
        return Array.from(allKeys);
      }
      return Array.from(allKeys).filter((k) => k.startsWith(prefix));
    },
  });
}
harden(makeBaggageStorageAdapter);
