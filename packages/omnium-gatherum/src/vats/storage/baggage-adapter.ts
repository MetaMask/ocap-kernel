import type { Baggage } from '@metamask/ocap-kernel';
import type { Json } from '@metamask/utils';

import type { StorageAdapter } from '../../controllers/storage/types.ts';

/**
 * Create a StorageAdapter implementation backed by vat baggage.
 * Provides synchronous persistence (baggage writes are durable).
 *
 * @param baggage - The vat baggage store.
 * @returns A StorageAdapter backed by baggage.
 */
export function makeBaggageStorageAdapter(baggage: Baggage): StorageAdapter {
  return harden({
    async get<Value extends Json>(key: string): Promise<Value | undefined> {
      if (baggage.has(key)) {
        return baggage.get(key) as Value;
      }
      return undefined;
    },

    async set(key: string, value: Json): Promise<void> {
      if (baggage.has(key)) {
        baggage.set(key, harden(value));
      } else {
        baggage.init(key, harden(value));
      }
    },

    async delete(key: string): Promise<void> {
      if (baggage.has(key)) {
        baggage.delete(key);
      }
    },

    async keys(prefix?: string): Promise<string[]> {
      const allKeys = [...baggage.keys()];
      if (!prefix) {
        return allKeys;
      }
      return allKeys.filter((k) => k.startsWith(prefix));
    },
  });
}
harden(makeBaggageStorageAdapter);
