/**
 * This file is a copy of `@ocap/kernel/test/storage.ts`
 * Because the test dir isn't shipped, it is easier just to copy than to
 * do battle with the existing build configuration.
 */
import type { KVStore } from '@ocap/kernel';

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

  return {
    get: map.get.bind(map),
    getNextKey: (_key: string): string | undefined => {
      throw Error(`mock store does not (yet) support getNextKey`);
    },
    getRequired,
    set: map.set.bind(map),
    delete: map.delete.bind(map),
    clear: map.clear.bind(map),
    executeQuery: () => [],
  };
}
