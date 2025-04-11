/* eslint-disable no-lonely-if, no-else-return */
import type { KVStore } from '@ocap/store';

import type { VatCheckpoint } from '../types.ts';
import { keySearch } from '../utils/key-search.ts';

export type VatKVStore = KVStore & {
  checkpoint(): VatCheckpoint;
};

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
      keyCache ??= Array.from(state.keys()).sort();
      const index =
        lastNextKey === key ? lastNextKeyIndex : keySearch(keyCache, key);
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
      const result: VatCheckpoint = [
        Object.fromEntries(sets),
        Array.from(deletes),
      ];
      sets = new Map();
      deletes = new Set();
      return result;
    },
  };
}
