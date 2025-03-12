import type { KVStore } from '@ocap/store';

import type { EndpointId, KRef } from '../../types.ts';
import type { StoredValue } from '../types.ts';

/**
 * Get the base store methods for managing stored values and queues.
 *
 * @param kv - The key/value store to provide the underlying persistence mechanism.
 * @returns An object with methods for managing stored values and queues.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getBaseMethods(kv: KVStore) {
  /**
   * Get the key for the reachable flag and vatSlot for a given endpoint and kref.
   *
   * @param endpointId - The endpoint for which the reachable flag is being set.
   * @param kref - The kref.
   * @returns The key for the reachable flag and vatSlot.
   */
  function getSlotKey(endpointId: EndpointId, kref: KRef): string {
    return `${endpointId}.c.${kref}`;
  }

  /**
   * Increment the value of a persistently stored counter.
   *
   * Note that the while the value is interpreted as an integer (in order to
   * enable it to be incremented), it is stored and returned in the form of a
   * string. This is because (a) our persistent storage only stores strings, and
   * (b) the sole purpose of one of these counters is simply to provide an
   * unending sequence of unique values; we don't actually use them as numbers
   * or, indeed, even care at all if this sequence is produced using numbers.
   *
   * @param value - Reference to the stored value to be incremented.
   * @returns The value as it was prior to being incremented.
   */
  function incCounter(value: StoredValue): string {
    const current = value.get();
    const next = `${Number(current) + 1}`;
    value.set(next);
    return current as string;
  }

  /**
   * Provide a stored value object for which we keep an in-memory cache. We only
   * touch persistent storage if the value hasn't ever been read of if it is
   * modified; otherwise we can service read requests from memory.
   *
   * IMPORTANT NOTE: in order for the cache to work, all subsequent accesses to
   * the value MUST be made through a common stored value object.
   *
   * @param key - A key string that identifies the value.
   * @param init - If provided, an initial setting if the stored entity does not exist.
   * @returns An object for interacting with the value.
   */
  function provideCachedStoredValue(key: string, init?: string): StoredValue {
    let value: string | undefined = kv.get(key);
    if (value === undefined && init !== undefined) {
      kv.set(key, init);
      value = init;
    }
    return harden({
      get(): string | undefined {
        return value;
      },
      set(newValue: string): void {
        value = newValue;
        kv.set(key, value);
      },
      delete(): void {
        value = undefined;
        kv.delete(key);
      },
    });
  }

  /**
   * Provide a stored value object that is kept in persistent storage without caching.
   *
   * @param key - A key string that identifies the value.
   * @param init - If provided, an initial setting if the stored entity does not exist.
   * @returns An object for interacting with the value.
   */
  function provideRawStoredValue(key: string, init?: string): StoredValue {
    if (kv.get(key) === undefined && init !== undefined) {
      kv.set(key, init);
    }
    return harden({
      get: () => kv.get(key),
      set: (newValue: string) => kv.set(key, newValue),
      delete: () => kv.delete(key),
    });
  }

  return {
    getSlotKey,
    incCounter,
    // Stored value
    provideCachedStoredValue,
    provideRawStoredValue,
  };
}
