import type { Json } from '@metamask/utils';

import type { StorageAdapter } from '../src/controllers/storage/types.ts';

/**
 * Create a mock StorageAdapter for testing.
 *
 * @returns A mock storage adapter backed by an in-memory Map.
 */
export function makeMockStorageAdapter(): StorageAdapter {
  const store = new Map<string, Json>();

  return {
    async get<Value extends Json>(key: string): Promise<Value | undefined> {
      return store.get(key) as Value | undefined;
    },
    async set(key: string, value: Json): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async keys(prefix?: string): Promise<string[]> {
      const allKeys = Array.from(store.keys());
      if (prefix === undefined) {
        return allKeys;
      }
      return allKeys.filter((k) => k.startsWith(prefix));
    },
  };
}
