import { describe, it, expect, beforeEach } from 'vitest';

import { makeMapKernelDatabase } from '../../../test/storage.ts';
import { RunQueueItemType } from '../../types.ts';
import type { GCAction } from '../../types.ts';
import { makeKernelStore } from '../index.ts';

describe('GC methods', () => {
  let kernelStore: ReturnType<typeof makeKernelStore>;

  beforeEach(() => {
    kernelStore = makeKernelStore(makeMapKernelDatabase());
  });

  describe('GC actions', () => {
    it('manages all valid GC action types', () => {
      const ko1 = kernelStore.initKernelObject('v1');
      const ko2 = kernelStore.initKernelObject('v1');
      const ko3 = kernelStore.initKernelObject('v2');

      const validActions: GCAction[] = [
        `v1 dropExport ${ko1}`,
        `v1 retireExport ${ko2}`,
        `v2 retireImport ${ko3}`,
      ];

      kernelStore.addGCActions(validActions);

      const actions = kernelStore.getGCActions();
      expect(actions.size).toBe(3);
      expect(actions).toStrictEqual(new Set(validActions));
    });

    it('rejects invalid GC actions', () => {
      const ko1 = kernelStore.initKernelObject('v1');

      // Invalid vat ID
      expect(() => {
        kernelStore.addGCActions(['x1 dropExport ko1']);
      }).toThrow('not a valid VatId');

      // Invalid action type
      expect(() => {
        kernelStore.addGCActions([`v1 invalidAction ${ko1}`] as GCAction[]);
      }).toThrow('not a valid GCActionType "invalidAction"');

      // Invalid kref (must be kernel object, not promise)
      expect(() => {
        kernelStore.addGCActions(['v1 dropExport kp1']);
      }).toThrow('kernelSlot "kp1" is not of type "object"');

      // Malformed action string
      expect(() => {
        kernelStore.addGCActions(['v1 dropExport'] as unknown as GCAction[]);
      }).toThrow('kernelSlot is undefined');
    });

    it('maintains action order when storing', () => {
      const ko1 = kernelStore.initKernelObject('v1');
      const ko2 = kernelStore.initKernelObject('v2');
      const ko3 = kernelStore.initKernelObject('v3');

      const actions = [
        `v3 retireImport ${ko3}`,
        `v1 dropExport ${ko1}`,
        `v2 retireExport ${ko2}`,
      ];

      kernelStore.setGCActions(new Set(actions) as Set<GCAction>);

      // Actions should be sorted when retrieved
      const sortedActions = Array.from(kernelStore.getGCActions());
      expect(sortedActions).toStrictEqual([
        `v1 dropExport ${ko1}`,
        `v2 retireExport ${ko2}`,
        `v3 retireImport ${ko3}`,
      ]);
    });
  });

  describe('reachability tracking', () => {
    it('manages reachable flags', () => {
      const ko1 = kernelStore.initKernelObject('v1');
      kernelStore.addCListEntry('v1', ko1, 'o-1');

      expect(kernelStore.getReachableFlag('v1', ko1)).toBe(true);

      kernelStore.clearReachableFlag('v1', ko1);
      expect(kernelStore.getReachableFlag('v1', ko1)).toBe(false);

      const refCounts = kernelStore.getObjectRefCount(ko1);
      expect(refCounts.reachable).toBe(0);
    });
  });

  describe('reaping', () => {
    it('processes reap queue in order', () => {
      const vatIds = ['v1', 'v2', 'v3'];

      // Schedule multiple vats for reaping
      vatIds.forEach((vatId) => kernelStore.scheduleReap(vatId));

      // Verify they are processed in order
      vatIds.forEach((vatId) => {
        expect(kernelStore.nextReapAction()).toStrictEqual({
          type: RunQueueItemType.bringOutYourDead,
          vatId,
        });
      });

      // Queue should be empty after processing all items
      expect(kernelStore.nextReapAction()).toBeUndefined();
    });

    it('handles duplicate reap scheduling', () => {
      kernelStore.scheduleReap('v1');
      kernelStore.scheduleReap('v1'); // Duplicate scheduling
      kernelStore.scheduleReap('v2');

      // Should only process v1 once
      expect(kernelStore.nextReapAction()).toStrictEqual({
        type: RunQueueItemType.bringOutYourDead,
        vatId: 'v1',
      });

      expect(kernelStore.nextReapAction()).toStrictEqual({
        type: RunQueueItemType.bringOutYourDead,
        vatId: 'v2',
      });

      expect(kernelStore.nextReapAction()).toBeUndefined();
    });
  });
});
