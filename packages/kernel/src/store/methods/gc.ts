import { getBaseMethods } from './base.ts';
import { getObjectMethods } from './object.ts';
import { getRefCountMethods } from './refcount.ts';
import type {
  VatId,
  EndpointId,
  KRef,
  GCAction,
  RunQueueItemBringOutYourDead,
} from '../../types.ts';
import {
  insistGCActionType,
  insistVatId,
  RunQueueItemType,
} from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { insistKernelType } from '../utils/kernel-slots.ts';
import { parseRef } from '../utils/parse-ref.ts';
import {
  buildReachableAndVatSlot,
  parseReachableAndVatSlot,
} from '../utils/reachable.ts';

/**
 * Create a store for garbage collection.
 *
 * @param ctx - The store context.
 * @returns The GC store.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getGCMethods(ctx: StoreContext) {
  const { getSlotKey } = getBaseMethods(ctx.kv);
  const { getObjectRefCount, setObjectRefCount } = getObjectMethods(ctx);
  const { kernelRefExists } = getRefCountMethods(ctx);

  /**
   * Get the set of GC actions to perform.
   *
   * @returns The set of GC actions to perform.
   */
  function getGCActions(): Set<GCAction> {
    return new Set(JSON.parse(ctx.gcActions.get() ?? '[]'));
  }

  /**
   * Set the set of GC actions to perform.
   *
   * @param actions - The set of GC actions to perform.
   */
  function setGCActions(actions: Set<GCAction>): void {
    const a = Array.from(actions);
    a.sort();
    ctx.gcActions.set(JSON.stringify(a));
  }

  /**
   * Add a new GC action to the set of GC actions to perform.
   *
   * @param newActions - The new GC action to add.
   */
  function addGCActions(newActions: GCAction[]): void {
    const actions = getGCActions();
    for (const action of newActions) {
      assert.typeof(action, 'string', 'addGCActions given bad action');
      const [vatId, type, kref] = action.split(' ');
      insistVatId(vatId);
      insistGCActionType(type);
      insistKernelType('object', kref);
      actions.add(action);
    }
    setGCActions(actions);
  }

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
   * Clear the reachable flag for a given endpoint and kref.
   *
   * @param endpointId - The endpoint for which the reachable flag is being cleared.
   * @param kref - The kref.
   */
  function clearReachableFlag(endpointId: EndpointId, kref: KRef): void {
    const key = getSlotKey(endpointId, kref);
    const { isReachable, vatSlot } = parseReachableAndVatSlot(
      ctx.kv.getRequired(key),
    );
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

  /**
   * Schedule a vat for reaping.
   *
   * @param vatId - The vat to schedule for reaping.
   */
  function scheduleReap(vatId: VatId): void {
    const queue = JSON.parse(ctx.reapQueue.get() ?? '[]');
    if (!queue.includes(vatId)) {
      queue.push(vatId);
      ctx.reapQueue.set(JSON.stringify(queue));
    }
  }

  /**
   * Get the next reap action.
   *
   * @returns The next reap action, or undefined if the queue is empty.
   */
  function nextReapAction(): RunQueueItemBringOutYourDead | undefined {
    const queue = JSON.parse(ctx.reapQueue.get() ?? '[]');
    if (queue.length > 0) {
      const vatId = queue.shift();
      ctx.reapQueue.set(JSON.stringify(queue));
      return harden({ type: RunQueueItemType.bringOutYourDead, vatId });
    }
    return undefined;
  }

  return {
    // GC actions
    getGCActions,
    setGCActions,
    addGCActions,
    // Reachability tracking
    getReachableFlag,
    clearReachableFlag,
    // Reaping
    scheduleReap,
    nextReapAction,
  };
}
