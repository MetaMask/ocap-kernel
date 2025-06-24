import type { KernelDatabase } from '@metamask/kernel-store';
import { describe, it, expect, beforeEach } from 'vitest';

import { makeKernelStore } from './index.ts';
import { makeMapKernelDatabase } from '../../test/storage.ts';
import type { RunQueueItem } from '../types.ts';

/**
 * Mock RunQueueItem: A stupid TS hack to allow trivial use of plain strings
 * as if they were RunQueueItems, since, for testing purposes here, all
 * that's necessary to be a "message" is to be stringifiable.
 *
 * @param str - A string.
 * @returns The same string coerced to type RunQueueItem.
 */
function tm(str: string): RunQueueItem {
  return str as unknown as RunQueueItem;
}

describe('kernel store', () => {
  let mockKernelDatabase: KernelDatabase;

  beforeEach(() => {
    mockKernelDatabase = makeMapKernelDatabase();
  });

  describe('initialization', () => {
    it('has a working KV store', () => {
      const ks = makeKernelStore(mockKernelDatabase);
      const { kv } = ks;
      expect(kv.get('foo')).toBeUndefined();
      kv.set('foo', 'some value');
      expect(kv.get('foo')).toBe('some value');
      kv.delete('foo');
      expect(kv.get('foo')).toBeUndefined();
      expect(() => kv.getRequired('foo')).toThrow(
        'No value found for key foo.',
      );
    });
    it('has all the expected parts', () => {
      const ks = makeKernelStore(mockKernelDatabase);
      expect(Object.keys(ks).sort()).toStrictEqual([
        'addCListEntry',
        'addGCActions',
        'addPromiseSubscriber',
        'addSubcluster',
        'addSubclusterVat',
        'allocateErefForKref',
        'cleanupTerminatedVat',
        'clear',
        'clearEmptySubclusters',
        'clearReachableFlag',
        'collectGarbage',
        'createCrankSavepoint',
        'decRefCount',
        'decrementRefCount',
        'deleteCListEntry',
        'deleteEndpoint',
        'deleteKernelObject',
        'deleteKernelPromise',
        'deleteSubcluster',
        'deleteSubclusterVat',
        'deleteVat',
        'deleteVatConfig',
        'dequeueRun',
        'endCrank',
        'enqueuePromiseMessage',
        'enqueueRun',
        'erefToKref',
        'exportFromVat',
        'forgetEref',
        'forgetKref',
        'forgetTerminatedVat',
        'getAllVatRecords',
        'getGCActions',
        'getImporters',
        'getKernelPromise',
        'getKernelPromiseMessageQueue',
        'getKpidsToRetire',
        'getNextObjectId',
        'getNextPromiseId',
        'getNextRemoteId',
        'getNextVatId',
        'getObjectRefCount',
        'getOwner',
        'getPinnedObjects',
        'getPromisesByDecider',
        'getQueueLength',
        'getReachableAndVatSlot',
        'getReachableFlag',
        'getRefCount',
        'getRootObject',
        'getSubcluster',
        'getSubclusterVats',
        'getSubclusters',
        'getTerminatedVats',
        'getVatConfig',
        'getVatIDs',
        'getVatSubcluster',
        'hasCListEntry',
        'importsKernelSlot',
        'incRefCount',
        'incrementRefCount',
        'initEndpoint',
        'initKernelObject',
        'initKernelPromise',
        'isObjectPinned',
        'isRevoked',
        'isRootObject',
        'isVatActive',
        'isVatTerminated',
        'kernelRefExists',
        'krefToEref',
        'krefsToExistingErefs',
        'kv',
        'makeVatStore',
        'markVatAsTerminated',
        'nextReapAction',
        'nextTerminatedVatCleanup',
        'pinObject',
        'releaseAllSavepoints',
        'removeVatFromSubcluster',
        'reset',
        'resolveKernelPromise',
        'retireKernelObjects',
        'revoke',
        'rollbackCrank',
        'runQueueLength',
        'scheduleReap',
        'setGCActions',
        'setObjectRefCount',
        'setPromiseDecider',
        'setRevoked',
        'setVatConfig',
        'startCrank',
        'translateCapDataKtoV',
        'translateMessageKtoV',
        'translateRefKtoV',
        'translateSyscallVtoK',
        'unpinObject',
      ]);
    });
  });

  describe('kernel entity management', () => {
    it('generates IDs', () => {
      const ks = makeKernelStore(mockKernelDatabase);
      expect(ks.getNextVatId()).toBe('v1');
      expect(ks.getNextVatId()).toBe('v2');
      expect(ks.getNextVatId()).toBe('v3');
      expect(ks.getNextRemoteId()).toBe('r1');
      expect(ks.getNextRemoteId()).toBe('r2');
      expect(ks.getNextRemoteId()).toBe('r3');
    });
    it('manages kernel objects', () => {
      const ks = makeKernelStore(mockKernelDatabase);
      const ko1Owner = 'v47';
      const ko2Owner = 'r23';
      expect(ks.initKernelObject(ko1Owner)).toBe('ko1');

      // Check that the object is initialized with reachable=1, recognizable=1
      const refCounts = ks.getObjectRefCount('ko1');
      expect(refCounts.reachable).toBe(1);
      expect(refCounts.recognizable).toBe(1);

      // Increment the reference count
      ks.incrementRefCount('ko1', 'test');
      expect(ks.getObjectRefCount('ko1').reachable).toBe(2);
      expect(ks.getObjectRefCount('ko1').recognizable).toBe(2);

      // Increment again
      ks.incrementRefCount('ko1', 'test');
      expect(ks.getObjectRefCount('ko1').reachable).toBe(3);
      expect(ks.getObjectRefCount('ko1').recognizable).toBe(3);

      // Decrement
      ks.decrementRefCount('ko1', 'tess');
      expect(ks.getObjectRefCount('ko1').reachable).toBe(2);
      expect(ks.getObjectRefCount('ko1').recognizable).toBe(2);

      // Decrement twice more to reach 0
      ks.decrementRefCount('ko1', 'test');
      ks.decrementRefCount('ko1', 'test');
      expect(ks.getObjectRefCount('ko1').reachable).toBe(0);
      expect(ks.getObjectRefCount('ko1').recognizable).toBe(0);

      // Create another object
      expect(ks.initKernelObject(ko2Owner)).toBe('ko2');

      // Check owners
      expect(ks.getOwner('ko1')).toBe(ko1Owner);
      expect(ks.getOwner('ko2')).toBe(ko2Owner);

      // Delete an object
      ks.deleteKernelObject('ko1');
      expect(() => ks.getOwner('ko1')).toThrow('unknown kernel object ko1');
      expect(() => ks.getOwner('ko99')).toThrow('unknown kernel object ko99');
    });
    it('manages kernel promises', () => {
      const ks = makeKernelStore(mockKernelDatabase);
      const kp1 = {
        state: 'unresolved',
        subscribers: [],
      };
      const kp2 = {
        state: 'unresolved',
        subscribers: [],
      };
      expect(ks.initKernelPromise()).toStrictEqual(['kp1', kp1]);
      expect(ks.getRefCount('kp1')).toBe(1);
      expect(ks.incRefCount('kp1')).toBe(2);
      ks.incRefCount('kp1');
      expect(ks.getRefCount('kp1')).toBe(3);
      expect(ks.decRefCount('kp1')).toBe(2);
      ks.decRefCount('kp1');
      ks.decRefCount('kp1');
      expect(ks.getRefCount('kp1')).toBe(0);
      expect(ks.initKernelPromise()).toStrictEqual(['kp2', kp2]);
      expect(ks.getKernelPromise('kp1')).toStrictEqual(kp1);
      expect(ks.getKernelPromise('kp2')).toStrictEqual(kp2);
      const msg1 = {
        methargs: {
          body: 'first message to kp1',
          slots: [],
        },
        result: null,
      };
      ks.enqueuePromiseMessage('kp1', msg1);
      const msg2 = {
        methargs: {
          body: 'second message to kp1',
          slots: [],
        },
        result: null,
      };
      ks.enqueuePromiseMessage('kp1', msg2);
      expect(ks.getKernelPromiseMessageQueue('kp1')).toStrictEqual([
        msg1,
        msg2,
      ]);
      expect(ks.getKernelPromiseMessageQueue('kp1')).toStrictEqual([]);
      ks.enqueuePromiseMessage('kp1', {
        methargs: {
          body: 'sacrificial message',
          slots: [],
        },
        result: null,
      });
      ks.deleteKernelPromise('kp1');
      expect(() => ks.getKernelPromise('kp1')).toThrow(
        'unknown kernel promise kp1',
      );
      expect(() => ks.getKernelPromise('kp99')).toThrow(
        'unknown kernel promise kp99',
      );
    });
    it('manages the run queue', () => {
      const ks = makeKernelStore(mockKernelDatabase);
      ks.enqueueRun(tm('first message'));
      ks.enqueueRun(tm('second message'));
      expect(ks.dequeueRun()).toBe('first message');
      ks.enqueueRun(tm('third message'));
      expect(ks.dequeueRun()).toBe('second message');
      expect(ks.dequeueRun()).toBe('third message');
      expect(ks.dequeueRun()).toBeUndefined();
      ks.enqueueRun(tm('fourth message'));
      expect(ks.dequeueRun()).toBe('fourth message');
      expect(ks.dequeueRun()).toBeUndefined();
    });
    it('manages clists', () => {
      const ks = makeKernelStore(mockKernelDatabase);

      // Create objects first to ensure they exist in the kernel
      const ko42 = ks.initKernelObject('v2');
      const ko51 = ks.initKernelObject('v2');
      const [kp60] = ks.initKernelPromise();
      const [kp61] = ks.initKernelPromise();

      // Add C-list entries
      ks.addCListEntry('v2', ko42, 'o-63');
      ks.addCListEntry('v2', ko51, 'o-74');
      ks.addCListEntry('v2', kp60, 'p+85');
      ks.addCListEntry('r7', ko42, 'ro+11');
      ks.addCListEntry('r7', kp61, 'rp-99');

      // Verify mappings
      expect(ks.krefToEref('v2', ko42)).toBe('o-63');
      expect(ks.erefToKref('v2', 'o-63')).toBe(ko42);
      expect(ks.krefToEref('v2', ko51)).toBe('o-74');
      expect(ks.erefToKref('v2', 'o-74')).toBe(ko51);
      expect(ks.krefToEref('v2', kp60)).toBe('p+85');
      expect(ks.erefToKref('v2', 'p+85')).toBe(kp60);
      expect(ks.krefToEref('r7', ko42)).toBe('ro+11');
      expect(ks.erefToKref('r7', 'ro+11')).toBe(ko42);
      expect(ks.krefToEref('r7', kp61)).toBe('rp-99');
      expect(ks.erefToKref('r7', 'rp-99')).toBe(kp61);

      // Test forgetting entries
      ks.forgetKref('v2', ko42);
      expect(ks.krefToEref('v2', ko42)).toBeUndefined();
      expect(ks.erefToKref('v2', 'o-63')).toBeUndefined();

      ks.forgetEref('r7', 'rp-99');
      expect(ks.krefToEref('r7', kp61)).toBeUndefined();
      expect(ks.erefToKref('r7', 'rp-99')).toBeUndefined();

      // Verify C-list entry existence
      expect(ks.hasCListEntry('r7', ko42)).toBe(true);
      expect(ks.hasCListEntry('v2', ko42)).toBe(false); // We forgot this one
    });
  });

  describe('reset', () => {
    it('clears store and resets counters', () => {
      const ks = makeKernelStore(mockKernelDatabase);
      ks.getNextVatId();
      ks.getNextVatId();
      ks.getNextRemoteId();
      const koId = ks.initKernelObject('v1');
      const [kpId] = ks.initKernelPromise();
      ks.addCListEntry('v1', koId, 'o-1');
      ks.enqueueRun(tm('test message'));
      ks.reset();
      expect(ks.getNextVatId()).toBe('v1');
      expect(ks.getNextRemoteId()).toBe('r1');
      expect(() => ks.getOwner(koId)).toThrow(`unknown kernel object ${koId}`);
      expect(() => ks.getKernelPromise(kpId)).toThrow(
        `unknown kernel promise ${kpId}`,
      );
      expect(ks.krefToEref('v1', koId)).toBeUndefined();
      expect(ks.dequeueRun()).toBeUndefined();
    });
  });
});
