import type { Json } from '@metamask/utils';

import type { StorageAdapter } from '../src/controllers/storage/types.ts';

/**
 * Create a mock StorageAdapter for testing.
 *
 * @param storage - Optional Map to use as the backing store. Defaults to a new Map.
 * @returns A mock storage adapter backed by an in-memory Map.
 */
export function makeMockStorageAdapter(
  storage: Map<string, Json> = new Map(),
): StorageAdapter {
  return {
    async get<Value extends Json>(key: string): Promise<Value | undefined> {
      return storage.get(key) as Value | undefined;
    },
    async set(key: string, value: Json): Promise<void> {
      storage.set(key, value);
    },
    async delete(key: string): Promise<void> {
      storage.delete(key);
    },
    async keys(prefix?: string): Promise<string[]> {
      const allKeys = Array.from(storage.keys());
      return prefix ? allKeys.filter((k) => k.startsWith(prefix)) : allKeys;
    },
  };
}
