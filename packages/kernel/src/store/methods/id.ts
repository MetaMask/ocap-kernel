import { getBaseMethods } from './base.ts';
import type { VatId, RemoteId, EndpointId } from '../../types.ts';
import type { StoreContext } from '../types.ts';

/**
 * Create a store for allocating IDs.
 *
 * @param ctx - The store context.
 * @returns The ID store.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getIdMethods(ctx: StoreContext) {
  const { kv } = ctx;
  const { provideCachedStoredValue, incCounter } = getBaseMethods(kv);

  /** Counter for allocating VatIDs */
  let nextVatId = provideCachedStoredValue('nextVatId', '1');
  /** Counter for allocating RemoteIDs */
  let nextRemoteId = provideCachedStoredValue('nextRemoteId', '1');

  /**
   * Obtain an ID for a new vat.
   *
   * @returns The next VatID use.
   */
  function getNextVatId(): VatId {
    return `v${incCounter(nextVatId)}`;
  }

  /**
   * Obtain an ID for a new remote connection.
   *
   * @returns The next remote ID use.
   */
  function getNextRemoteId(): RemoteId {
    return `r${incCounter(nextRemoteId)}`;
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
    nextVatId = provideCachedStoredValue('nextVatId', '1');
    nextRemoteId = provideCachedStoredValue('nextRemoteId', '1');
  }

  return {
    getNextVatId,
    getNextRemoteId,
    initEndpoint,
    reset,
  };
}
