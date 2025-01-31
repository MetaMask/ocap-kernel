import type { KVStore } from '../src/store/kernel-store.js';

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
    const result = map.get(key);
    if (result === undefined) {
      throw Error(`No value found for key ${key}.`);
    }
    return result;
  }

  /**
   * Get the next key in lexicographical order after the given key.
   *
   * @param previousKey - The key to start from.
   * @returns The next key, or undefined if no more keys.
   */
  function getNextKey(previousKey: string): string | undefined {
    const keys = Array.from(map.keys()).sort();
    const index = keys.findIndex((key) => key > previousKey);
    return index >= 0 ? keys[index] : undefined;
  }

  return {
    get: map.get.bind(map),
    getNextKey,
    getRequired,
    set: map.set.bind(map),
    delete: map.delete.bind(map),
    clear: map.clear.bind(map),
    executeQuery: () => [],
  };
}
