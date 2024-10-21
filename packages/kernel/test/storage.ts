import type { KVStore } from '../src/kernel-store.js';

/**
 * A mock key/value store realized as a Map<string, string>.
 *
 * @returns The mock {@link KVStore}.
 */
export function makeMapKVStore(): KVStore {
  const map = new Map<string, string>();

  /**
   * Like `get`, but fail if the key isn't there.
   *
   * @param key - The key to fetch.
   * @returns The value at `key`.
   */
  function getRequired(key: string): string {
    if (!map.has(key)) {
      throw Error(`No value found for key ${key}.`);
    }
    return map.get(key);
  }

  return {
    get: map.get.bind(map),
    getRequired,
    set: map.set.bind(map),
    delete: map.delete.bind(map),
  };
}
