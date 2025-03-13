import type { KernelStore } from '../store';
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
import { assert } from '../utils/assert.ts';

/**
 * Parsed representation of a GC action.
 */
type ParsedGCAction = Readonly<{
  vatId: VatId;
  type: GCActionType;
  kref: KRef;
}>;

/**
 * Parse a GC action string into a vat id, type, and kref.
 *
 * @param action - The GC action string to parse.
 * @returns The parsed GC action.
 */
function parseAction(action: GCAction): ParsedGCAction {
  const [vatId, type, kref] = action.split(' ');
  insistVatId(vatId);
  insistGCActionType(type);
  insistKernelType('object', kref);
  return harden({ vatId, type, kref });
}

/**
 * Determines if a GC action should be processed based on current system state.
 *
 * @param storage - The kernel storage.
 * @param vatId - The vat id of the vat that owns the kref.
 * @param type - The type of GC action.
 * @param kref - The kref of the object in question.
 * @returns True if the action should be processed, false otherwise.
 */
function shouldProcessAction(
  storage: KernelStore,
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

  switch (type) {
    case 'dropExport':
      return exists && reachable === 0 && hasCList && isReachable === true;

    case 'retireExport':
      return exists && reachable === 0 && recognizable === 0 && hasCList;

    case 'retireImport':
      return hasCList;

    default:
      return false;
  }
}

/**
 * Filters and processes a group of GC actions for a specific vat and action type.
 *
 * @param storage - The kernel storage.
 * @param vatId - The vat id of the vat that owns the krefs.
 * @param actions - The set of GC actions to process.
 * @param allActionsSet - The complete set of GC actions.
 * @returns Object containing the krefs to process and whether the action set was updated.
 */
function filterActionsForProcessing(
  storage: KernelStore,
  vatId: VatId,
  actions: Set<GCAction>,
  allActionsSet: Set<GCAction>,
): { krefs: KRef[]; actionSetUpdated: boolean } {
  const krefs: KRef[] = [];
  let actionSetUpdated = false;

  for (const action of actions) {
    const { type, kref } = parseAction(action);
    if (shouldProcessAction(storage, vatId, type, kref)) {
      krefs.push(kref);
    }
    allActionsSet.delete(action);
    actionSetUpdated = true;
  }

  return harden({ krefs, actionSetUpdated });
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

  // Group actions by vat and type
  const actionsByVat = new Map<VatId, Map<GCActionType, Set<GCAction>>>();

  for (const action of allActionsSet) {
    const { vatId, type } = parseAction(action);

    if (!actionsByVat.has(vatId)) {
      actionsByVat.set(vatId, new Map());
    }

    const actionsForVatByType = actionsByVat.get(vatId);
    assert(actionsForVatByType !== undefined, `No actions for vat: ${vatId}`);

    if (!actionsForVatByType.has(type)) {
      actionsForVatByType.set(type, new Set());
    }

    const actions = actionsForVatByType.get(type);
    assert(actions !== undefined, `No actions for type: ${type}`);
    actions.add(action);
  }

  // Process actions in priority order
  const vatIds = Array.from(actionsByVat.keys()).sort();

  for (const vatId of vatIds) {
    const actionsForVatByType = actionsByVat.get(vatId);
    assert(actionsForVatByType !== undefined, `No actions for vat: ${vatId}`);

    // Find the highest-priority type of work to do within this vat
    for (const type of actionTypePriorities) {
      if (actionsForVatByType.has(type)) {
        const actions = actionsForVatByType.get(type);
        assert(actions !== undefined, `No actions for type: ${type}`);
        const { krefs, actionSetUpdated: updated } = filterActionsForProcessing(
          storage,
          vatId,
          actions,
          allActionsSet,
        );

        actionSetUpdated = actionSetUpdated || updated;

        if (krefs.length > 0) {
          // We found actions to process
          krefs.sort();

          // Update the durable set before returning
          storage.setGCActions(allActionsSet);

          const queueType = queueTypeFromActionType.get(type);
          assert(queueType !== undefined, `Unknown action type: ${type}`);

          return harden({ type: queueType, vatId, krefs });
        }
      }
    }
  }

  if (actionSetUpdated) {
    // Remove negated items from the durable set
    storage.setGCActions(allActionsSet);
  }

  // No GC work to do
  return undefined;
}

harden(processGCActionSet);
