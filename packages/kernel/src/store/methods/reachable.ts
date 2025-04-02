import type { EndpointId, KRef } from 'src/types';

import { getBaseMethods } from './base.ts';
import { getObjectMethods } from './object.ts';
import { getRefCountMethods } from './refcount.ts';
import type { StoreContext } from '../types';
import { parseRef } from '../utils/parse-ref.ts';
import {
  parseReachableAndVatSlot,
  buildReachableAndVatSlot,
} from '../utils/reachable.ts';

/**
 * Get the reachable methods that provide functionality for managing reachable flags.
 *
 * @param ctx - The store context.
 * @returns The reachable methods.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getReachableMethods(ctx: StoreContext) {
  const { getSlotKey } = getBaseMethods(ctx.kv);
  const { getObjectRefCount, setObjectRefCount } = getObjectMethods(ctx);
  const { kernelRefExists } = getRefCountMethods(ctx);

  /**
   * Check if a kernel object is reachable.
   *
   * @param endpointId - The endpoint for which the reachable flag is being checked.
   * @param kref - The kref.
   * @returns True if the kernel object is reachable, false otherwise.
   */
  function getReachableFlag(endpointId: EndpointId, kref: KRef): boolean {
    const key = getSlotKey(endpointId, kref);
    const data = ctx.kv.getRequired(key);
    const { isReachable } = parseReachableAndVatSlot(data);
    return isReachable;
  }

  /**
   * Get the reachable and vat slot for a given vat and kernel slot.
   *
   * @param endpointId - The vat ID.
   * @param kref - The kernel slot.
   * @returns The reachable and vat slot.
   */
  function getReachableAndVatSlot(
    endpointId: EndpointId,
    kref: KRef,
  ): {
    isReachable: boolean;
    vatSlot: string;
  } {
    const key = getSlotKey(endpointId, kref);
    const data = ctx.kv.getRequired(key);
    return parseReachableAndVatSlot(data);
  }

  /**
   * Clear the reachable flag for a given endpoint and kref.
   *
   * @param endpointId - The endpoint for which the reachable flag is being cleared.
   * @param kref - The kref.
   */
  function clearReachableFlag(endpointId: EndpointId, kref: KRef): void {
    const key = getSlotKey(endpointId, kref);
    const { isReachable, vatSlot } = getReachableAndVatSlot(endpointId, kref);
    ctx.kv.set(key, buildReachableAndVatSlot(false, vatSlot));
    const { direction, isPromise } = parseRef(vatSlot);
    // decrement 'reachable' part of refcount, but only for object imports
    if (
      isReachable &&
      !isPromise &&
      direction === 'import' &&
      kernelRefExists(kref)
    ) {
      const counts = getObjectRefCount(kref);
      counts.reachable -= 1;
      setObjectRefCount(kref, counts);
      if (counts.reachable === 0) {
        ctx.maybeFreeKrefs.add(kref);
      }
    }
  }

  return {
    getReachableFlag,
    getReachableAndVatSlot,
    clearReachableFlag,
  };
}
