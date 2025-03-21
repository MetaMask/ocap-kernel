import type { KVStore } from '@ocap/store';

import type { VatCheckpoint } from './types.ts';

export type VatKVStore = KVStore & {
  checkpoint(): VatCheckpoint;
};

/* eslint-disable no-lonely-if, no-else-return */ // stupid rules that encourage unclear code

/**
 * Create an in-memory VatKVStore for a vat, backed by a Map and tracking
 * changes so that they can be reported at the end of a crank.
 *
 * @param state - The state to begin with.
 *
 * @returns a VatKVStore wrapped around `state`.
 */
export function makeVatKVStore(state: Map<string, string>): VatKVStore {
  let sets: Map<string, string> = new Map();
  let deletes: Set<string> = new Set();
  let keyCache: string[] | null = null;
  let lastNextKey: string | null = null;
  let lastNextKeyIndex: number = -1;

  /**
   * Binary search for key position.
   * I totally can't believe I have to write this in 2025.
   *
   * @param key - The key to search `keyCache` for.
   *
   * @returns the index into `keyCache` of the first key that is greater than
   *   `key`, or -1 if no such key exists.
   */
  function search(key: string): number {
    if (keyCache === null) {
      // This shouldn't happen, but just in case...
      return -1;
    }
    let beg = 0;
    let end = keyCache.length - 1;
    if (key < (keyCache[beg] as string)) {
      return beg;
    }
    if ((keyCache[end] as string) < key) {
      return -1;
    }
    while (beg <= end) {
      const mid = Math.floor((beg + end) / 2);
      if (keyCache[mid] === key) {
        return mid;
      }
      if (key < (keyCache[mid] as string)) {
        end = mid - 1;
      } else {
        beg = mid + 1;
      }
      if (beg === end) {
        return beg;
      }
    }
    return -1;
  }

  return {
    get(key: string): string | undefined {
      return state.get(key);
    },
    getRequired(key: string): string {
      const result = state.get(key);
      if (result) {
        return result;
      }
      throw Error(`no value matching key '${key}'`);
    },
    getNextKey(key: string): string | undefined {
      if (keyCache === null) {
        keyCache = Array.from(state.keys()).sort();
      }
      const index = lastNextKey === key ? lastNextKeyIndex : search(key);
      if (index < 0) {
        lastNextKey = null;
        lastNextKeyIndex = -1;
        return undefined;
      }
      lastNextKey = keyCache[index] as string;
      if (key < lastNextKey) {
        lastNextKeyIndex = index;
        return lastNextKey;
      } else {
        if (index + 1 >= keyCache.length) {
          lastNextKey = null;
          lastNextKeyIndex = -1;
          return undefined;
        } else {
          lastNextKey = keyCache[index + 1] as string;
          lastNextKeyIndex = index + 1;
          return lastNextKey;
        }
      }
    },
    set(key: string, value: string): void {
      state.set(key, value);
      sets.set(key, value);
      deletes.delete(key);
      keyCache = null;
    },
    delete(key: string): void {
      state.delete(key);
      sets.delete(key);
      deletes.add(key);
      keyCache = null;
    },
    checkpoint(): VatCheckpoint {
      const result: VatCheckpoint = [sets, deletes];
      sets = new Map();
      deletes = new Set();
      return result;
    },
  };
}
