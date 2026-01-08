import type { Json } from '@metamask/utils';

import type { NamespacedStorage, StorageAdapter } from './types.ts';

/**
 * Create a namespaced storage interface.
 * All operations are scoped to the given namespace prefix.
 *
 * @param namespace - The namespace prefix for all keys.
 * @param adapter - The underlying storage adapter.
 * @returns A hardened NamespacedStorage instance.
 */
export function makeNamespacedStorage(
  namespace: string,
  adapter: StorageAdapter,
): NamespacedStorage {
  const prefix = `${namespace}.`;

  const buildKey = (key: string): string => `${prefix}${key}`;

  const stripPrefix = (fullKey: string): string => fullKey.slice(prefix.length);

  return harden({
    async get<Value extends Json>(key: string): Promise<Value | undefined> {
      return adapter.get<Value>(buildKey(key));
    },

    async set(key: string, value: Json): Promise<void> {
      await adapter.set(buildKey(key), value);
    },

    async delete(key: string): Promise<void> {
      await adapter.delete(buildKey(key));
    },

    async has(key: string): Promise<boolean> {
      const value = await adapter.get(buildKey(key));
      return value !== undefined;
    },

    async keys(): Promise<string[]> {
      const allKeys = await adapter.keys(prefix);
      return allKeys.map(stripPrefix);
    },

    async clear(): Promise<void> {
      const allKeys = await this.keys();
      await Promise.all(allKeys.map(async (key) => this.delete(key)));
    },
  });
}
harden(makeNamespacedStorage);
