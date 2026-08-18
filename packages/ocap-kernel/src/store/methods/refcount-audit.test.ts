import type { KernelDatabase } from '@metamask/kernel-store';
import { describe, it, expect, beforeEach } from 'vitest';

import { makeMapKernelDatabase } from '../../../test/storage.ts';
import type { KRef, VatConfig, VatId } from '../../types.ts';
import { makeKernelStore } from '../index.ts';

describe('reference count audit', () => {
  let kernelDatabase: KernelDatabase;
  let kernelStore: ReturnType<typeof makeKernelStore>;

  /**
   * Register and initialize an endpoint so it can hold c-list entries.
   *
   * @param vatIds - The vats to bring into existence.
   */
  function givenVats(...vatIds: VatId[]): void {
    for (const vatId of vatIds) {
      kernelStore.setVatConfig(vatId, { sourceSpec: 'x' } as VatConfig);
      kernelStore.initEndpoint(vatId);
    }
  }

  beforeEach(() => {
    kernelDatabase = makeMapKernelDatabase();
    kernelStore = makeKernelStore(kernelDatabase);
    kernelStore.markInitialized();
    givenVats('v1', 'v2', 'v3');
  });

  describe('auditRefCounts', () => {
    it('finds nothing wrong in an empty store', () => {
      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });

    it.each([
      {
        what: 'an export',
        act: (kref: KRef) => kref,
      },
      {
        what: 'an export plus one importer',
        act: (kref: KRef) => {
          kernelStore.translateRefKtoE('v2', kref, true);
          return kref;
        },
      },
      {
        what: 'an export plus two importers',
        act: (kref: KRef) => {
          kernelStore.translateRefKtoE('v2', kref, true);
          kernelStore.translateRefKtoE('v3', kref, true);
          return kref;
        },
      },
      {
        what: 'a dropped import',
        act: (kref: KRef) => {
          kernelStore.translateRefKtoE('v2', kref, true);
          kernelStore.clearReachableFlag('v2', kref);
          return kref;
        },
      },
      {
        what: 'a retired import',
        act: (kref: KRef) => {
          kernelStore.translateRefKtoE('v2', kref, true);
          kernelStore.clearReachableFlag('v2', kref);
          kernelStore.forgetKref('v2', kref);
          return kref;
        },
      },
      {
        what: 'a pin',
        act: (kref: KRef) => {
          kernelStore.pinObject(kref);
          return kref;
        },
      },
      {
        what: 'a queued message',
        act: (kref: KRef) => {
          kernelStore.enqueueRun({
            type: 'send',
            target: kref,
            message: { methargs: { body: '#[]', slots: [kref] }, result: null },
          });
          kernelStore.incrementRefCount(kref, 'queue|target');
          kernelStore.incrementRefCount(kref, 'queue|slot');
          return kref;
        },
      },
    ])('holds for $what', ({ act }) => {
      act(kernelStore.exportFromEndpoint('v1', 'o+1'));

      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });

    it('holds for an unsettled promise with importers', () => {
      const kpid = kernelStore.exportFromEndpoint('v1', 'p+1');
      kernelStore.translateRefKtoE('v2', kpid, true);

      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
      expect(kernelStore.getRefCount(kpid)).toBe(3);
    });

    it('holds for a settled promise whose value carries a slot', () => {
      const koid = kernelStore.exportFromEndpoint('v1', 'o+1');
      const kpid = kernelStore.exportFromEndpoint('v1', 'p+1');
      kernelStore.incrementRefCount(koid, 'resolve|slot');
      kernelStore.resolveKernelPromise(kpid, false, {
        body: '#"$0"',
        slots: [koid],
      });

      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });

    it('reports a settled promise that lost its value instead of throwing', () => {
      const koid = kernelStore.exportFromEndpoint('v1', 'o+1');
      const kpid = kernelStore.exportFromEndpoint('v1', 'p+1');
      kernelStore.incrementRefCount(koid, 'resolve|slot');
      kernelStore.resolveKernelPromise(kpid, false, {
        body: '#"$0"',
        slots: [koid],
      });
      // `gc.ts` and `getKpidsToRetire` both allow this state, so the audit has
      // to survive it: the slot's holder is gone, which is drift to report, not
      // a reason to take the whole sweep down.
      kernelDatabase.kernelKVStore.delete(`${kpid}.value`);

      expect(kernelStore.auditRefCounts()).toStrictEqual([
        {
          kref: koid,
          stored: '1,1',
          expected: '0,0',
          holders: [],
        },
      ]);
    });

    it('reports counts that are too low', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.translateRefKtoE('v2', kref, true);
      kernelStore.setObjectRefCount(kref, { reachable: 0, recognizable: 0 });

      expect(kernelStore.auditRefCounts()).toStrictEqual([
        {
          kref,
          stored: '0,0',
          expected: '1,1',
          holders: ['v2 c-list import o-1'],
        },
      ]);
    });

    it('reports counts that are too high even though nothing underflowed', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.setObjectRefCount(kref, { reachable: 1, recognizable: 1 });

      expect(kernelStore.auditRefCounts()).toStrictEqual([
        { kref, stored: '1,1', expected: '0,0', holders: [] },
      ]);
    });

    it('reports a reference to a kref that has been deleted', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.translateRefKtoE('v2', kref, true);
      kernelStore.deleteKernelObject(kref);

      expect(kernelStore.auditRefCounts()).toStrictEqual([
        {
          kref,
          stored: '(deleted)',
          expected: '1,1',
          holders: ['v2 c-list import o-1'],
        },
      ]);
    });

    it.each([
      { what: 'more reachable than recognizable', row: '3,1' },
      { what: 'not a pair of numbers', row: 'NaN,0' },
      { what: 'a promise count on an object', row: '1' },
    ])('reports a row that is $what', ({ row }) => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.translateRefKtoE('v2', kref, true);
      // Written past the store's own guards, as a store drifted by an earlier
      // kernel would arrive: `getObjectRefCount` throws on all three, so
      // reading the row through it would take the whole sweep down with the
      // one violation it exists to report.
      kernelDatabase.kernelKVStore.set(`${kref}.refCount`, row);

      expect(kernelStore.auditRefCounts()).toStrictEqual([
        {
          kref,
          stored: row,
          expected: '1,1',
          holders: ['v2 c-list import o-1'],
        },
      ]);
    });

    it('does not mistake an owner for a referrer', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');

      expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
        reachable: 0,
        recognizable: 0,
      });
      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });
  });

  describe('assertRefCountsIfAuditing', () => {
    it('does nothing while auditing is off', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.setObjectRefCount(kref, { reachable: 9, recognizable: 9 });

      expect(() => kernelStore.assertRefCountsIfAuditing()).not.toThrow();
    });

    it('throws with the offending krefs once auditing is on', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.setObjectRefCount(kref, { reachable: 9, recognizable: 9 });
      kernelStore.setRefCountAuditing(true);

      expect(() => kernelStore.assertRefCountsIfAuditing()).toThrow(
        `${kref}: stored 9,9, expected 0,0`,
      );
    });

    it('stays quiet when the counts agree', () => {
      kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.setRefCountAuditing(true);

      expect(() => kernelStore.assertRefCountsIfAuditing()).not.toThrow();
    });
  });

  describe('recomputeRefCounts', () => {
    it('rebuilds counts written under the old accounting', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.translateRefKtoE('v2', kref, true);
      kernelStore.translateRefKtoE('v3', kref, true);
      // As the pre-fix kernel would have left it: born (1,1), with neither
      // importer's c-list entry taking a reference. Two importers is the
      // smallest topology where that disagrees with the truth — with one, the
      // phantom baseline happens to come out to the right number.
      kernelStore.setObjectRefCount(kref, { reachable: 1, recognizable: 1 });

      const { corrected, unfixable } = kernelStore.recomputeRefCounts();

      expect(corrected).toStrictEqual([
        {
          kref,
          stored: '1,1',
          expected: '2,2',
          holders: ['v2 c-list import o-1', 'v3 c-list import o-1'],
        },
      ]);
      expect(unfixable).toStrictEqual([]);
      expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
        reachable: 2,
        recognizable: 2,
      });
      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });

    it('reports references it cannot repair', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.translateRefKtoE('v2', kref, true);
      kernelStore.deleteKernelObject(kref);

      const { corrected, unfixable } = kernelStore.recomputeRefCounts();

      expect(corrected).toStrictEqual([]);
      expect(unfixable).toHaveLength(1);
      expect(unfixable[0]?.kref).toBe(kref);
    });

    it('queues krefs it zeroes for collection', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.setObjectRefCount(kref, { reachable: 1, recognizable: 1 });

      kernelStore.recomputeRefCounts();
      kernelStore.collectGarbage();

      expect([...kernelStore.getGCActions()]).toStrictEqual([
        `v1 dropExport ${kref}`,
        `v1 retireExport ${kref}`,
      ]);
    });
  });

  describe('formatRefCountViolations', () => {
    it('names the holders behind a mismatch', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.translateRefKtoE('v2', kref, true);
      kernelStore.setObjectRefCount(kref, { reachable: 0, recognizable: 0 });

      expect(
        kernelStore.formatRefCountViolations(kernelStore.auditRefCounts()),
      ).toBe(
        `${kref}: stored 0,0, expected 1,1 (held by: v2 c-list import o-1)`,
      );
    });

    it('says so when a mismatch has no holders at all', () => {
      const kref = kernelStore.exportFromEndpoint('v1', 'o+1');
      kernelStore.setObjectRefCount(kref, { reachable: 1, recognizable: 1 });

      expect(
        kernelStore.formatRefCountViolations(kernelStore.auditRefCounts()),
      ).toBe(`${kref}: stored 1,1, expected 0,0 (held by: nothing)`);
    });
  });
});
