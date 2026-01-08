import type { Json } from '@metamask/utils';

import type { StorageAdapter } from './types.ts';

/**
 * Create a storage adapter backed by Chrome Storage API.
 *
 * @param storage - The Chrome storage area to use (defaults to chrome.storage.local).
 * @returns A hardened StorageAdapter instance.
 */
export function makeChromeStorageAdapter(
  storage: chrome.storage.StorageArea = chrome.storage.local,
): StorageAdapter {
  return harden({
    async get<Value extends Json>(key: string): Promise<Value | undefined> {
      const result = await storage.get(key);
      return result[key] as Value | undefined;
    },

    async set(key: string, value: Json): Promise<void> {
      await storage.set({ [key]: value });
    },

    async delete(key: string): Promise<void> {
      await storage.remove(key);
    },

    async keys(prefix?: string): Promise<string[]> {
      const all = await storage.get(null);
      const allKeys = Object.keys(all);
      if (prefix === undefined) {
        return allKeys;
      }
      return allKeys.filter((k) => k.startsWith(prefix));
    },
  });
}
harden(makeChromeStorageAdapter);
