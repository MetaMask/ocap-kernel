import type { KVStore } from '@ocap/store';

import type { makeBaseStore } from './base-store.ts';
import type { VatId, RemoteId, EndpointId } from '../types.ts';

/**
 * Create a store for allocating IDs.
 *
 * @param kv - The key-value store to use for persistent storage.
 * @param baseStore - The base store to use for the ID store.
 * @returns The ID store.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeIdStore(
  kv: KVStore,
  baseStore: ReturnType<typeof makeBaseStore>,
) {
  /** Counter for allocating VatIDs */
  let nextVatId = baseStore.provideCachedStoredValue('nextVatId', '1');
  /** Counter for allocating RemoteIDs */
  let nextRemoteId = baseStore.provideCachedStoredValue('nextRemoteId', '1');

  /**
   * Obtain an ID for a new vat.
   *
   * @returns The next VatID use.
   */
  function getNextVatId(): VatId {
    return `v${baseStore.incCounter(nextVatId)}`;
  }

  /**
   * Obtain an ID for a new remote connection.
   *
   * @returns The next remote ID use.
   */
  function getNextRemoteId(): RemoteId {
    return `r${baseStore.incCounter(nextRemoteId)}`;
  }

  /**
   * Initialize persistent state for a new endpoint.
   *
   * @param endpointId - The ID of the endpoint being added.
   */
  function initEndpoint(endpointId: EndpointId): void {
    kv.set(`e.nextPromiseId.${endpointId}`, '1');
    kv.set(`e.nextObjectId.${endpointId}`, '1');
  }

  /**
   * Clear the kernel's persistent state and reset all counters.
   */
  function reset(): void {
    nextVatId = baseStore.provideCachedStoredValue('nextVatId', '1');
    nextRemoteId = baseStore.provideCachedStoredValue('nextRemoteId', '1');
  }

  return {
    getNextVatId,
    getNextRemoteId,
    initEndpoint,
    reset,
  };
}
