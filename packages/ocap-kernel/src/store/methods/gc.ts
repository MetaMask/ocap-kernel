import { Fail } from '@endo/errors';

import { getBaseMethods } from './base.ts';
import { getObjectMethods } from './object.ts';
import { getPromiseMethods } from './promise.ts';
import { getReachableMethods } from './reachable.ts';
import { getRefCountMethods } from './refcount.ts';
import { getSubclusterMethods } from './subclusters.ts';
import { getVatMethods } from './vat.ts';
import type {
  VatId,
  KRef,
  GCAction,
  RunQueueItemBringOutYourDead,
} from '../../types.ts';
import { insistGCActionType, insistVatId } from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { insistKernelType, parseKernelSlot } from '../utils/kernel-slots.ts';

/**
 * Create a store for garbage collection.
 *
 * @param ctx - The store context.
 * @returns The GC store.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getGCMethods(ctx: StoreContext) {
  const { getSlotKey, getOwnerKey } = getBaseMethods(ctx.kv);
  const { getRefCount, decrementRefCount } = getRefCountMethods(ctx);
  const { getObjectRefCount, deleteKernelObject } = getObjectMethods(ctx);
  const { getKernelPromise, deleteKernelPromise } = getPromiseMethods(ctx);
  const { getImporters, isVatTerminated } = getVatMethods(ctx);
  const { getReachableFlag, getReachableAndVatSlot } = getReachableMethods(ctx);
  const { clearEmptySubclusters } = getSubclusterMethods(ctx);

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
      const endpointId = queue.shift();
      ctx.reapQueue.set(JSON.stringify(queue));
      return harden({ type: 'bringOutYourDead', endpointId });
    }
    return undefined;
  }

  /**
   * Retires kernel objects by notifying importers and removing the objects.
   *
   * @param koids - Array of kernel object IDs to retire.
   */
  function retireKernelObjects(koids: KRef[]): void {
    Array.isArray(koids) || Fail`retireExports given non-Array ${koids}`;
    const newActions: GCAction[] = [];
    for (const koid of koids) {
      const importers = getImporters(koid);
      for (const vatID of importers) {
        newActions.push(`${vatID} retireImport ${koid}`);
      }
      deleteKernelObject(koid);
    }
    addGCActions(newActions);
  }

  /**
   * Processes reference counts for kernel resources and performs garbage collection actions
   * for resources that are no longer referenced or should be retired.
   */
  function collectGarbage(): void {
    const actions: Set<GCAction> = new Set();
    for (const kref of ctx.maybeFreeKrefs.values()) {
      const { type } = parseKernelSlot(kref);
      if (type === 'promise') {
        const kpid = kref;
        const kp = getKernelPromise(kpid);
        const refCount = getRefCount(kpid);
        if (refCount === 0) {
          if (kp.state === 'fulfilled' || kp.state === 'rejected') {
            // https://github.com/Agoric/agoric-sdk/issues/9888 don't assume promise is settled
            for (const slot of kp.value?.slots ?? []) {
              // Note: the following decrement can result in an addition to the
              // maybeFreeKrefs set, which we are in the midst of iterating.
              // TC39 went to a lot of trouble to ensure that this is kosher.
              decrementRefCount(slot, 'gc|promise|slot');
            }
          }
          deleteKernelPromise(kpid);
        }
      }

      if (type === 'object') {
        const { reachable, recognizable } = getObjectRefCount(kref);
        if (reachable === 0) {
          const ownerKey = getOwnerKey(kref);
          let ownerVatID = ctx.kv.get(ownerKey);
          if (ownerVatID === 'kernel') {
            continue;
          }
          const terminated = isVatTerminated(ownerVatID as VatId);

          // Some objects that are still owned, but the owning vat
          // might still alive, or might be terminated and in the
          // process of being deleted. These two clauses are
          // mutually exclusive.
          if (ownerVatID && !terminated) {
            const vatConsidersReachable = getReachableFlag(ownerVatID, kref);
            if (vatConsidersReachable) {
              // the reachable count is zero, but the vat doesn't realize it
              actions.add(`${ownerVatID} dropExport ${kref}`);
            }
            if (recognizable === 0) {
              // TODO: rethink this assert
              // assert.equal(vatConsidersReachable, false, `${kref} is reachable but not recognizable`);
              actions.add(`${ownerVatID} retireExport ${kref}`);
            }
          } else if (ownerVatID && terminated) {
            // When we're slowly deleting a vat, and one of its
            // exports becomes unreferenced, we obviously must not
            // send dropExports or retireExports into the dead vat.
            // We fast-forward the abandonment that slow-deletion
            // would have done, then treat the object as orphaned.

            const { vatSlot } = getReachableAndVatSlot(ownerVatID, kref);
            // delete directly, not orphanKernelObject(), which
            // would re-submit to maybeFreeKrefs
            ctx.kv.delete(ownerKey);
            ctx.kv.delete(getSlotKey(ownerVatID, kref));
            ctx.kv.delete(getSlotKey(ownerVatID, vatSlot));
            // now fall through to the orphaned case
            ownerVatID = undefined;
          }

          // Now handle objects which were orphaned. NOTE: this
          // includes objects which were owned by a terminated (but
          // not fully deleted) vat, where `ownerVatID` was cleared
          // in the last line of that previous clause (the
          // fall-through case). Don't try to change this `if
          // (!ownerVatID)` into an `else if`: the two clauses are
          // *not* mutually-exclusive.
          if (!ownerVatID) {
            // orphaned and unreachable, so retire it. If the kref
            // is recognizable, then we need retireKernelObjects()
            // to scan for importers and send retireImports (and
            // delete), else we can call deleteKernelObject directly
            if (recognizable) {
              retireKernelObjects([kref]);
            } else {
              deleteKernelObject(kref);
            }
          }
        }
      }
    }
    addGCActions([...actions]);
    ctx.maybeFreeKrefs.clear();
    clearEmptySubclusters();
  }

  return {
    getGCActions,
    setGCActions,
    addGCActions,
    scheduleReap,
    nextReapAction,
    retireKernelObjects,
    collectGarbage,
  };
}
