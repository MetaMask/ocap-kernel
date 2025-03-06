import type { KVStore } from '@ocap/store';

import type { VatCheckpoint } from './types.ts';

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

  return {
    get(key: string): string | undefined {
      return state.get(key);
    },
    getRequired(key: string): string {
      const result = state.get(key);
      if (result) {
        return result;
      }
      throw Error(`no record matching key '${key}'`);
    },
    getNextKey(_previousKey: string): string | undefined {
      // WARNING: this is a VERY expensive and complicated operation to
      // implement if the backing store is an ordinary Map object fronted by the
      // sets & deletes tables as we are doing here. However, the only customer
      // of this KVStore is Liveslots, which does not use this operation, so it
      // is not actually required. This "implementation" simply returns
      // undefined, solely in interest of making the compiler happy -- it does
      // not actually work! If you try to use it expecting something useful, it
      // will go badly for you.
      return undefined;
    },
    set(key: string, value: string): void {
      state.set(key, value);
      sets.set(key, value);
      deletes.delete(key);
    },
    delete(key: string): void {
      state.delete(key);
      sets.delete(key);
      deletes.add(key);
    },
    checkpoint(): VatCheckpoint {
      const result: VatCheckpoint = [sets, deletes];
      sets = new Map();
      deletes = new Set();
      return result;
    },
  };
}
