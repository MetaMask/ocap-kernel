import type { KernelStore } from '../store/kernel-store.ts';
import { insistKernelType } from '../store/utils/kernel-slots.ts';
import type {
  GCAction,
  GCActionType,
  KRef,
  RunQueueItem,
  VatId,
} from '../types.ts';
import {
  actionTypePriorities,
  insistGCActionType,
  insistVatId,
  queueTypeFromActionType,
} from '../types.ts';

/**
 * Parse a GC action string into a vat id, type, and kref.
 *
 * @param action - The GC action string to parse.
 * @returns The vat id, type, and kref.
 */
function parseAction(action: GCAction): {
  vatId: VatId;
  type: GCActionType;
  kref: KRef;
} {
  const [vatId, type, kref] = action.split(' ');
  insistVatId(vatId);
  insistGCActionType(type);
  insistKernelType('object', kref);
  return { vatId, type, kref };
}

/**
 * Process the set of GC actions.
 *
 * @param storage - The kernel storage.
 * @returns The next action to process, or undefined if there are no actions to process.
 */
export function processGCActionSet(
  storage: KernelStore,
): RunQueueItem | undefined {
  const allActionsSet = storage.getGCActions();
  let actionSetUpdated = false;

  // GC actions are each one of 'dropExport', 'retireExport', or
  // 'retireImport', aimed at a specific vat and affecting a specific kref.
  // They are added to the durable "GC Actions" set (stored in kernelDB) when
  // `processRefcounts` notices a refcount sitting at zero, which means some
  // vat needs to be told that an object can be freed. Before each crank, the
  // kernel calls processGCActionSet to see if there are any GC actions that
  // should be taken. All such GC actions are executed before any regular vat
  // delivery gets to run.

  // However, things might have changed between the time the action was
  // pushed into the durable set and the time the kernel is ready to execute
  // it. For example, the kref might have been re-exported: we were all set
  // to tell the exporting vat that their object isn't recognizable any more
  // (with a `dispatch.retireExport`), but then they sent a brand new copy to
  // some importer. We must negate the `retireExport` action, because it's no
  // longer the right thing to do. Alternatively, the exporting vat might
  // have deleted the object itself (`syscall.retireExport`) before the
  // kernel got a chance to deliver the `dispatch.retireExport`, which means
  // we must bypass the action as redundant (since it's an error to delete
  // the same c-list entry twice).

  /**
   * Inspect a queued GC action and decide whether the current state of c-lists
   * and reference counts warrants processing it, or if it should instead be
   * negated/bypassed.
   *
   * @param vatId - The vat id of the vat that owns the kref.
   * @param type - The type of GC action.
   * @param kref - The kref of the object in question.
   * @returns True if the action should be processed, false otherwise.
   */
  function shouldProcessAction(
    vatId: VatId,
    type: GCActionType,
    kref: KRef,
  ): boolean {
    const hasCList = storage.hasCListEntry(vatId, kref);
    const isReachable = hasCList
      ? storage.getReachableFlag(vatId, kref)
      : undefined;
    const exists = storage.kernelRefExists(kref);
    const { reachable, recognizable } = exists
      ? storage.getObjectRefCount(kref)
      : { reachable: 0, recognizable: 0 };

    if (type === 'dropExport') {
      if (!exists) {
        return false;
      } // already, shouldn't happen
      if (reachable) {
        return false;
      } // negated
      if (!hasCList) {
        return false;
      } // already, shouldn't happen
      if (!isReachable) {
        return false;
      } // already, shouldn't happen
    }
    if (type === 'retireExport') {
      if (!exists) {
        return false;
      } // already
      if (reachable || recognizable) {
        return false;
      } // negated
      if (!hasCList) {
        return false;
      } // already
    }
    if (type === 'retireImport') {
      if (!hasCList) {
        return false;
      } // already
    }
    return true;
  }

  // We process actions in groups (sorted first by vat, then by type), to
  // make it deterministic, and to ensure that `dropExport` happens before
  // `retireExport`. This examines one group at a time, filtering everything
  // in that group, and returning the survivors of the first group that
  // wasn't filtered out entirely. Our available dispatch functions take
  // multiple krefs (`dispatch.dropExports`, rather than
  // `dispatch.dropExport`), so the set of surviving krefs can all be
  // delivered to a vat in a single crank.

  // Some day we may consolidate the three GC delivery methods into a single
  // one, in which case we'll batch together an entire vat's worth of
  // actions, instead of the narrower (vat+type) group. The filtering rules
  // may need to change to support that, to ensure that `dropExport` and
  // `retireExport` can both be delivered.

  /**
   * Process the set of GC actions for a given vat.
   *
   * @param vatId - The vat id of the vat that owns the krefs.
   * @param groupedActions - The set of GC actions to process.
   * @returns The krefs to process.
   */
  function krefsToProcess(vatId: VatId, groupedActions: Set<GCAction>): KRef[] {
    const krefs: KRef[] = [];
    for (const action of groupedActions) {
      const { type, kref } = parseAction(action);
      if (shouldProcessAction(vatId, type, kref)) {
        krefs.push(kref);
      }
      allActionsSet.delete(action);
      actionSetUpdated = true;
    }
    return krefs;
  }

  const actionsByVat = new Map();
  for (const action of allActionsSet) {
    const { vatId, type } = parseAction(action);
    if (!actionsByVat.has(vatId)) {
      actionsByVat.set(vatId, new Map());
    }
    const actionsForVatByType = actionsByVat.get(vatId);
    if (!actionsForVatByType.has(type)) {
      actionsForVatByType.set(type, []);
    }
    actionsForVatByType.get(type).push(action);
  }

  const vatIds = Array.from(actionsByVat.keys());
  vatIds.sort();
  for (const vatId of vatIds) {
    const actionsForVatByType = actionsByVat.get(vatId);
    // find the highest-priority type of work to do within this vat
    for (const type of actionTypePriorities) {
      if (actionsForVatByType.has(type)) {
        const actions = actionsForVatByType.get(type);
        const krefs = krefsToProcess(vatId, actions);
        if (krefs.length) {
          // at last, we act
          krefs.sort();
          // remove the work we're about to do from the durable set
          storage.setGCActions(allActionsSet);
          const queueType = queueTypeFromActionType.get(type);
          assert(queueType, `Unknown action type: ${type}`);
          return harden({ type: queueType, vatId, krefs });
        }
      }
    }
  }

  if (actionSetUpdated) {
    // remove negated items from the durable set
    storage.setGCActions(allActionsSet);
  }

  // no GC work to do and no DB changes
  return undefined;
}
harden(processGCActionSet);
