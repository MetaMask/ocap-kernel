import type { KVStore } from '@ocap/store';

import type { makeBaseStore } from './base-store.ts';
import type { makeObjectStore } from './object-store.ts';
import type { makeRefCountStore } from './refcount-store.ts';
import { insistKernelType } from './utils/kernel-slots.ts';
import { parseRef } from './utils/parse-ref.ts';
import {
  buildReachableAndVatSlot,
  parseReachableAndVatSlot,
} from './utils/reachable.ts';
import type {
  VatId,
  EndpointId,
  KRef,
  GCAction,
  RunQueueItemBringOutYourDead,
} from '../types.ts';
import { insistGCActionType, insistVatId, RunQueueItemType } from '../types.ts';

/**
 * Create a store for garbage collection.
 *
 * @param kv - The key-value store to use for persistent storage.
 * @param baseStore - The base store to use for the GC store.
 * @param refCountStore - The refcount store to use for the GC store.
 * @param objectStore - The object store to use for the GC store.
 * @returns The GC store.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeGCStore(
  kv: KVStore,
  baseStore: ReturnType<typeof makeBaseStore>,
  refCountStore: ReturnType<typeof makeRefCountStore>,
  objectStore: ReturnType<typeof makeObjectStore>,
) {
  let gcActions = baseStore.provideCachedStoredValue('gcActions', '[]');
  let reapQueue = baseStore.provideCachedStoredValue('reapQueue', '[]');

  /**
   * Get the set of GC actions to perform.
   *
   * @returns The set of GC actions to perform.
   */
  function getGCActions(): Set<GCAction> {
    return new Set(JSON.parse(gcActions.get() ?? '[]'));
  }

  /**
   * Set the set of GC actions to perform.
   *
   * @param actions - The set of GC actions to perform.
   */
  function setGCActions(actions: Set<GCAction>): void {
    const a = Array.from(actions);
    a.sort();
    gcActions.set(JSON.stringify(a));
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
    const key = baseStore.getSlotKey(endpointId, kref);
    const data = kv.getRequired(key);
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
    const key = baseStore.getSlotKey(endpointId, kref);
    const { isReachable, vatSlot } = parseReachableAndVatSlot(
      kv.getRequired(key),
    );
    kv.set(key, buildReachableAndVatSlot(false, vatSlot));
    const { direction, isPromise } = parseRef(vatSlot);
    // decrement 'reachable' part of refcount, but only for object imports
    if (
      isReachable &&
      !isPromise &&
      direction === 'import' &&
      refCountStore.kernelRefExists(kref)
    ) {
      const counts = objectStore.getObjectRefCount(kref);
      counts.reachable -= 1;
      objectStore.setObjectRefCount(kref, counts);
      if (counts.reachable === 0) {
        baseStore.maybeFreeKrefs.add(kref);
      }
    }
  }

  /**
   * Schedule a vat for reaping.
   *
   * @param vatId - The vat to schedule for reaping.
   */
  function scheduleReap(vatId: VatId): void {
    const queue = JSON.parse(reapQueue.get() ?? '[]');
    if (!queue.includes(vatId)) {
      queue.push(vatId);
      reapQueue.set(JSON.stringify(queue));
    }
  }

  /**
   * Get the next reap action.
   *
   * @returns The next reap action, or undefined if the queue is empty.
   */
  function nextReapAction(): RunQueueItemBringOutYourDead | undefined {
    const queue = JSON.parse(reapQueue.get() ?? '[]');
    if (queue.length > 0) {
      const vatId = queue.shift();
      reapQueue.set(JSON.stringify(queue));
      return harden({ type: RunQueueItemType.bringOutYourDead, vatId });
    }
    return undefined;
  }

  /**
   * Reset the GC store.
   */
  function reset(): void {
    baseStore.maybeFreeKrefs.clear();
    gcActions = baseStore.provideCachedStoredValue('gcActions', '[]');
    reapQueue = baseStore.provideCachedStoredValue('reapQueue', '[]');
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
    // Reset
    reset,
  };
}
