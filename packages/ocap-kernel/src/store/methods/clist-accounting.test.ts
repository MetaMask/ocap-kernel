import { describe, it, expect, beforeEach } from 'vitest';

import { asRemoteId, asVatId, asVRef } from '../../../test/branded.ts';
import { makeMapKernelDatabase } from '../../../test/storage.ts';
import { performExportCleanup } from '../../garbage-collection/gc-handlers.ts';
import type { VatConfig, VatId, KRef } from '../../types.ts';
import { makeKernelStore } from '../index.ts';

/**
 * Regressions for the asymmetry described in
 * https://github.com/Consensys-Incorporated/ocap-kernel/issues/1006: creating
 * an import c-list entry changed no refcount while tearing one down decremented
 * both, and `initKernelObject` compensated by minting every object at (1, 1).
 * That constant came out right for exactly one importer, which is why nothing
 * noticed.
 */
describe('c-list reference accounting', () => {
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
    kernelStore = makeKernelStore(makeMapKernelDatabase());
    kernelStore.markInitialized();
    kernelStore.setRefCountAuditing(true);
    givenVats(asVatId('v1'), asVatId('v2'), asVatId('v3'));
  });

  it('releases an endpoint c-list entry rather than dropping it', () => {
    kernelStore.initEndpoint(asRemoteId('r1'));
    const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
    kernelStore.translateRefKtoE(asRemoteId('r1'), kref, true);

    kernelStore.deleteEndpoint(asRemoteId('r1'));

    // A bare key delete would leave the count behind, pinning the object alive
    // on the strength of a holder that no longer exists.
    expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 0,
      recognizable: 0,
    });
    expect(kernelStore.krefToEref(asRemoteId('r1'), kref)).toBeUndefined();
    expect(kernelStore.auditRefCounts()).toStrictEqual([]);
  });

  it('counts each importer separately', () => {
    const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));

    expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 0,
      recognizable: 0,
    });

    kernelStore.translateRefKtoE(asVatId('v2'), kref, true);
    expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 1,
      recognizable: 1,
    });

    kernelStore.translateRefKtoE(asVatId('v3'), kref, true);
    expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 2,
      recognizable: 2,
    });
  });

  it('keeps an object alive for a second importer after the first lets go', () => {
    const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
    kernelStore.translateRefKtoE(asVatId('v2'), kref, true);
    kernelStore.translateRefKtoE(asVatId('v3'), kref, true);

    kernelStore.clearReachableFlag(asVatId('v2'), kref);
    kernelStore.forgetKref(asVatId('v2'), kref);
    kernelStore.collectGarbage();

    // v3 still holds it, so the owner must not be told to drop or retire
    expect([...kernelStore.getGCActions()]).toStrictEqual([]);
    expect(kernelStore.getReachableFlag(asVatId('v3'), kref)).toBe(true);
    expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 1,
      recognizable: 1,
    });
    expect(kernelStore.auditRefCounts()).toStrictEqual([]);
  });

  it('drops an object once the last of several importers lets go', () => {
    const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
    for (const vatId of ['v2', 'v3'] as VatId[]) {
      kernelStore.translateRefKtoE(vatId, kref, true);
      kernelStore.clearReachableFlag(vatId, kref);
      kernelStore.forgetKref(vatId, kref);
    }
    kernelStore.collectGarbage();

    expect([...kernelStore.getGCActions()]).toStrictEqual([
      `v1 dropExport ${kref}`,
      `v1 retireExport ${kref}`,
    ]);
  });

  it('cleans up a terminated owner whose importer had already dropped', () => {
    const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
    kernelStore.translateRefKtoE(asVatId('v2'), kref, true);
    kernelStore.clearReachableFlag(asVatId('v2'), kref);
    kernelStore.markVatAsTerminated(asVatId('v1'));

    // Previously the owner's baseline decrement drove this below zero and threw
    // out of the middle of the export loop, leaving the vat half-cleaned
    expect(kernelStore.cleanupTerminatedVat(asVatId('v1'))).toStrictEqual({
      exports: 1,
      imports: 0,
      promises: 0,
      kv: 0,
    });
    expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 0,
      recognizable: 1,
    });
    expect(kernelStore.auditRefCounts()).toStrictEqual([]);
  });

  it('restores reachability when a dropped import is handed over again', () => {
    const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
    const eref = kernelStore.translateRefKtoE(asVatId('v2'), kref, true);
    kernelStore.clearReachableFlag(asVatId('v2'), kref);

    expect(kernelStore.getReachableFlag(asVatId('v2'), kref)).toBe(false);
    expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 0,
      recognizable: 1,
    });

    expect(kernelStore.translateRefKtoE(asVatId('v2'), kref, true)).toBe(eref);
    expect(kernelStore.getReachableFlag(asVatId('v2'), kref)).toBe(true);
    expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 1,
      recognizable: 1,
    });
  });

  it('does not inflate the count when the same import is translated twice', () => {
    const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
    kernelStore.translateRefKtoE(asVatId('v2'), kref, true);
    kernelStore.translateRefKtoE(asVatId('v2'), kref, true);
    kernelStore.translateRefKtoE(asVatId('v2'), kref, true);

    expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 1,
      recognizable: 1,
    });
  });

  it('collects an object whose only reference went splat', () => {
    const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
    kernelStore.incrementRefCount(kref, 'queue|slot');
    kernelStore.decrementRefCount(kref, 'deliver|splat|slot');

    // Previously this settled at (1,1) with no holder, forever
    expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
      reachable: 0,
      recognizable: 0,
    });
    kernelStore.collectGarbage();
    expect([...kernelStore.getGCActions()]).toStrictEqual([
      `v1 dropExport ${kref}`,
      `v1 retireExport ${kref}`,
    ]);
    expect(kernelStore.getImporters(kref)).toStrictEqual([]);
  });

  describe('cleanupTerminatedVat', () => {
    it('does nothing for a vat that is not terminated', () => {
      expect(kernelStore.cleanupTerminatedVat(asVatId('v1'))).toStrictEqual({
        exports: 0,
        imports: 0,
        promises: 0,
        kv: 0,
      });
    });

    it('orphans exports, releases imports, and forgets the vat', () => {
      const mine = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
      const theirs = kernelStore.exportFromEndpoint(
        asVatId('v2'),
        asVRef('o+1'),
      );
      kernelStore.translateRefKtoE(asVatId('v1'), theirs, true);
      kernelStore.translateRefKtoE(asVatId('v3'), mine, true);
      kernelStore.markVatAsTerminated(asVatId('v1'));

      const work = kernelStore.cleanupTerminatedVat(asVatId('v1'));

      expect(work).toMatchObject({ exports: 1, imports: 1, promises: 0 });
      // v1's export is orphaned but still recognized by v3
      expect(kernelStore.getOwner(mine)).toBeUndefined();
      expect(kernelStore.getObjectRefCount(mine)).toStrictEqual({
        reachable: 1,
        recognizable: 1,
      });
      // v1's import of v2's object is released
      expect(kernelStore.getObjectRefCount(theirs)).toStrictEqual({
        reachable: 0,
        recognizable: 0,
      });
      expect(kernelStore.hasCListEntry(asVatId('v1'), mine)).toBe(false);
      expect(kernelStore.hasCListEntry(asVatId('v1'), theirs)).toBe(false);
      expect(kernelStore.isVatTerminated(asVatId('v1'))).toBe(false);
      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });

    it('releases the c-list entry of a promise the vat was deciding', () => {
      const kpid = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('p+1'));
      kernelStore.setPromiseDecider(kpid, asVatId('v1'));
      kernelStore.translateRefKtoE(asVatId('v2'), kpid, true);
      // The caller rejects the orphans first, which is what releases the
      // unsettled-promise reference and clears the decider
      expect([
        ...kernelStore.getPromisesByDecider(asVatId('v1')),
      ]).toStrictEqual([kpid]);
      kernelStore.resolveKernelPromise(kpid, true, {
        body: '#"gone"',
        slots: [],
      });
      kernelStore.markVatAsTerminated(asVatId('v1'));

      const work = kernelStore.cleanupTerminatedVat(asVatId('v1'));

      expect(work).toMatchObject({ exports: 0, imports: 0, promises: 1 });
      expect(kernelStore.getRefCount(kpid)).toBe(1);
      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });

    it('tolerates an importer entry that outlives the object it names', () => {
      const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
      kernelStore.translateRefKtoE(asVatId('v3'), kref, true);
      // v3 has let go of the object but can still recognize the name
      kernelStore.clearReachableFlag(asVatId('v3'), kref);
      kernelStore.markVatAsTerminated(asVatId('v1'));
      kernelStore.cleanupTerminatedVat(asVatId('v1'));

      kernelStore.collectGarbage();

      // The collector deletes the object and queues the retirement together, so
      // v3's entry names a kref the kernel has already dropped until that action
      // is delivered. Counting it as a holder fails the end-of-crank audit on a
      // state the collector itself just created, which kills the run loop.
      expect([...kernelStore.getGCActions()]).toStrictEqual([
        `v3 retireImport ${kref}`,
      ]);
      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });

    it('leaves a live vat that shares the object untouched', () => {
      const kref = kernelStore.exportFromEndpoint(asVatId('v2'), asVRef('o+1'));
      kernelStore.translateRefKtoE(asVatId('v1'), kref, true);
      kernelStore.translateRefKtoE(asVatId('v3'), kref, true);
      kernelStore.markVatAsTerminated(asVatId('v1'));

      kernelStore.cleanupTerminatedVat(asVatId('v1'));
      kernelStore.collectGarbage();

      expect(kernelStore.getReachableFlag(asVatId('v3'), kref)).toBe(true);
      expect([...kernelStore.getGCActions()]).toStrictEqual([]);
      expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
        reachable: 1,
        recognizable: 1,
      });
    });
  });

  describe('three endpoints sharing one object', () => {
    it('accounts for every hand-off and release in turn', () => {
      const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
      const importers = ['v2', 'v3'] as VatId[];

      for (const vatId of importers) {
        kernelStore.translateRefKtoE(vatId, kref, true);
      }
      expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
        reachable: 2,
        recognizable: 2,
      });
      expect(kernelStore.getImporters(kref)).toStrictEqual(importers);
      expect(kernelStore.auditRefCounts()).toStrictEqual([]);

      // v2 drops but still recognizes
      kernelStore.clearReachableFlag(asVatId('v2'), kref);
      expect(kernelStore.getObjectRefCount(kref)).toStrictEqual({
        reachable: 1,
        recognizable: 2,
      });
      kernelStore.collectGarbage();
      expect([...kernelStore.getGCActions()]).toStrictEqual([]);

      // v2 retires; v3 keeps it alive
      kernelStore.forgetKref(asVatId('v2'), kref);
      kernelStore.collectGarbage();
      expect([...kernelStore.getGCActions()]).toStrictEqual([]);
      expect(kernelStore.getImporters(kref)).toStrictEqual(['v3']);

      // v3 lets go too, and only now is the owner told
      kernelStore.clearReachableFlag(asVatId('v3'), kref);
      kernelStore.forgetKref(asVatId('v3'), kref);
      kernelStore.collectGarbage();
      expect([...kernelStore.getGCActions()]).toStrictEqual([
        `v1 dropExport ${kref}`,
        `v1 retireExport ${kref}`,
      ]);
      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });
  });

  describe('an owner that gives up its own export', () => {
    /**
     * Retire an export on the owner's behalf, the way a `retireExports`
     * syscall does.
     *
     * @param kref - The object being given up.
     */
    function givenV1RetiresIt(kref: KRef): void {
      kernelStore.clearReachableFlag(asVatId('v1'), kref);
      performExportCleanup([kref], true, asVatId('v1'), kernelStore);
    }

    it('frees the object once the last importer lets go', () => {
      const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
      kernelStore.translateRefKtoE(asVatId('v2'), kref, true);
      kernelStore.clearReachableFlag(asVatId('v2'), kref);
      kernelStore.collectGarbage();

      givenV1RetiresIt(kref);

      kernelStore.forgetKref(asVatId('v2'), kref);
      kernelStore.collectGarbage();

      expect(kernelStore.kernelRefExists(kref)).toBe(false);
      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });

    it('collects an orphan that no importer ever recognized', () => {
      const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));

      givenV1RetiresIt(kref);
      kernelStore.collectGarbage();

      expect(kernelStore.getOwner(kref)).toBeUndefined();
      expect(kernelStore.kernelRefExists(kref)).toBe(false);
    });

    it('retires stragglers that still recognize an orphaned object', () => {
      const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
      kernelStore.translateRefKtoE(asVatId('v2'), kref, true);
      kernelStore.clearReachableFlag(asVatId('v2'), kref);

      givenV1RetiresIt(kref);
      kernelStore.collectGarbage();

      expect([...kernelStore.getGCActions()]).toStrictEqual([
        `v2 retireImport ${kref}`,
      ]);
      // v2's entry outlives the object it names until that action is delivered.
      // The audit has to tolerate that window, or the end-of-crank check throws
      // on a state the collector itself just created.
      expect(kernelStore.auditRefCounts()).toStrictEqual([]);
    });

    it('rejects an endpoint disowning an object it does not own', () => {
      const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
      kernelStore.translateRefKtoE(asVatId('v2'), kref, true);

      expect(() => kernelStore.orphanKernelObject(kref, asVatId('v2'))).toThrow(
        'owned by "v1"',
      );
      expect(kernelStore.getOwner(kref)).toBe('v1');
    });

    it('survives an owner mapping left behind without a c-list entry', () => {
      const kref = kernelStore.exportFromEndpoint(asVatId('v1'), asVRef('o+1'));
      kernelStore.translateRefKtoE(asVatId('v2'), kref, true);
      kernelStore.clearReachableFlag(asVatId('v2'), kref);
      kernelStore.clearReachableFlag(asVatId('v1'), kref);
      // Tear the owner's side down but leave the ownership record, the shape
      // that used to make the next collection read a key that wasn't there.
      kernelStore.forgetKref(asVatId('v1'), kref);
      kernelStore.forgetKref(asVatId('v2'), kref);

      expect(() => kernelStore.collectGarbage()).not.toThrow();
      expect(kernelStore.getOwner(kref)).toBeUndefined();
      expect(kernelStore.kernelRefExists(kref)).toBe(false);
    });
  });
});
