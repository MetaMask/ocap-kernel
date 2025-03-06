import type { KVStore, KernelDatabase, VatStore } from '@ocap/store';

/**
 * A mock key/value store realized as a Map<string, string>.
 *
 * @returns The mock {@link KVStore}.
 */
export function makeMapKVStore(): KVStore {
  return makeMapKVStoreInternal(new Map<string, string>());
}

/**
 * Internal helper function to build mock key/value stores, where the backing
 * map is injected so it can be manipulated externally.
 *
 * @param map - The Map that will hold the mock store's state.
 *
 * @returns The mock {@link KVStore}.
 */
function makeMapKVStoreInternal(map: Map<string, string>): KVStore {
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
  };
}

type ClearableVatStore = VatStore & {
  clear: () => void;
};

/**
 * Make a mock VatStore backed by a Map.
 *
 * @param _vatID - The vat ID of the vat whose store this will be (not used here).
 *
 * @returns the mock {@link VatStore}.
 */
function makeMapVatStore(_vatID: string): ClearableVatStore {
  const map = new Map<string, string>();
  return {
    getKVData: () => map,
    updateKVData: (sets: Map<string, string>, deletes: Set<string>) => {
      for (const [key, value] of sets.entries()) {
        map.set(key, value);
      }
      for (const key of deletes.values()) {
        map.delete(key);
      }
    },
    clear: () => map.clear(),
  };
}

/**
 * Make a mock Kernel database using Maps.
 *
 * @returns the mock {@link KernelDatabase}.
 */
export function makeMapKernelDatabase(): KernelDatabase {
  const map = new Map<string, string>();
  const vatStores = new Set<ClearableVatStore>();
  return {
    kernelKVStore: makeMapKVStoreInternal(map),
    clear: () => {
      map.clear();
      for (const vs of vatStores) {
        vs.clear();
      }
    },
    executeQuery: () => [],
    makeVatStore: (vatID: string) => {
      const store = makeMapVatStore(vatID);
      vatStores.add(store);
      return store;
    },
  };
}
