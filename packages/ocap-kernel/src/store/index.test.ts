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
        'cleanupOrphanMessages',
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
        'deletePendingMessage',
        'deleteRemoteInfo',
        'deleteRemotePendingState',
        'deleteSubcluster',
        'deleteSubclusterVat',
        'deleteVat',
        'deleteVatConfig',
        'dequeueRun',
        'endCrank',
        'enqueuePromiseMessage',
        'enqueueRun',
        'erefToKref',
        'exportFromEndpoint',
        'forgetEref',
        'forgetKref',
        'forgetTerminatedVat',
        'getAllRemoteRecords',
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
        'getPendingMessage',
        'getPinnedObjects',
        'getPromisesByDecider',
        'getQueueLength',
        'getReachableAndVatSlot',
        'getReachableFlag',
        'getRefCount',
        'getRemoteInfo',
        'getRemoteSeqState',
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
        'invertRRef',
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
        'provideIncarnationId',
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
        'setPendingMessage',
        'setPromiseDecider',
        'setRemoteHighestReceivedSeq',
        'setRemoteInfo',
        'setRemoteNextSendSeq',
        'setRemoteStartSeq',
        'setRevoked',
        'setVatConfig',
        'startCrank',
        'translateCapDataEtoK',
        'translateCapDataKtoE',
        'translateMessageEtoK',
        'translateMessageKtoE',
        'translateRefEtoK',
        'translateRefKtoE',
        'translateSyscallVtoK',
        'unpinObject',
        'waitForCrank',
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
      expect(ks.getOwner('ko1')).toBeUndefined();
      expect(ks.getOwner('ko99')).toBeUndefined();
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
      expect(ks.getOwner(koId)).toBeUndefined();
      expect(() => ks.getKernelPromise(kpId)).toThrow(
        `unknown kernel promise ${kpId}`,
      );
      expect(ks.krefToEref('v1', koId)).toBeUndefined();
      expect(ks.dequeueRun()).toBeUndefined();
    });

    it('preserves specified keys when resetting', () => {
      const ks = makeKernelStore(mockKernelDatabase);

      // Set up some state
      ks.getNextVatId();
      ks.getNextVatId();
      const koId = ks.initKernelObject('v1');
      ks.enqueueRun(tm('test message'));

      // Set some custom keys that we want to preserve
      ks.kv.set('keySeed', 'preserved-seed');
      ks.kv.set('peerId', 'preserved-peer');
      ks.kv.set('ocapURLKey', 'preserved-url');
      ks.kv.set('someOtherKey', 'should-be-cleared');

      // Reset with except parameter
      ks.reset({ except: ['keySeed', 'peerId', 'ocapURLKey'] });

      // Check that counters are reset
      expect(ks.getNextVatId()).toBe('v1');
      expect(ks.getNextRemoteId()).toBe('r1');

      // Check that state is cleared
      expect(ks.getOwner(koId)).toBeUndefined();
      expect(ks.dequeueRun()).toBeUndefined();

      // Check that preserved keys are still there
      expect(ks.kv.get('keySeed')).toBe('preserved-seed');
      expect(ks.kv.get('peerId')).toBe('preserved-peer');
      expect(ks.kv.get('ocapURLKey')).toBe('preserved-url');

      // Check that non-preserved keys are cleared
      expect(ks.kv.get('someOtherKey')).toBeUndefined();
    });

    it('does not restore keys with undefined values', () => {
      const ks = makeKernelStore(mockKernelDatabase);

      // Set up some state
      ks.getNextVatId();
      const koId = ks.initKernelObject('v1');

      // Set some keys with values and some without
      ks.kv.set('existingKey', 'has-value');
      // Don't set 'undefinedKey' - it will be undefined
      // Don't set 'nullKey' - it will be undefined

      // Reset with except parameter including undefined keys
      ks.reset({ except: ['existingKey', 'undefinedKey', 'nullKey'] });

      // Check that counters are reset
      expect(ks.getNextVatId()).toBe('v1');
      expect(ks.getOwner(koId)).toBeUndefined();

      // Check that only keys with values are restored
      expect(ks.kv.get('existingKey')).toBe('has-value');
      expect(ks.kv.get('undefinedKey')).toBeUndefined();
      expect(ks.kv.get('nullKey')).toBeUndefined();
    });

    it('resets all keys when no except parameter provided', () => {
      const ks = makeKernelStore(mockKernelDatabase);

      // Set up some state
      ks.getNextVatId();
      const koId = ks.initKernelObject('v1');
      ks.kv.set('customKey', 'should-be-cleared');

      // Reset without except parameter
      ks.reset();

      // Check that everything is reset
      expect(ks.getNextVatId()).toBe('v1');
      expect(ks.getOwner(koId)).toBeUndefined();
      expect(ks.kv.get('customKey')).toBeUndefined();
    });
  });

  describe('incarnation ID', () => {
    it('generates a new incarnation ID on first call', () => {
      const ks = makeKernelStore(mockKernelDatabase);

      const incarnationId = ks.provideIncarnationId();

      expect(typeof incarnationId).toBe('string');
      expect(incarnationId).toHaveLength(36); // UUID format
      expect(ks.kv.get('incarnationId')).toBe(incarnationId);
    });

    it('returns the same incarnation ID on subsequent calls', () => {
      const ks = makeKernelStore(mockKernelDatabase);

      const first = ks.provideIncarnationId();
      const second = ks.provideIncarnationId();
      const third = ks.provideIncarnationId();

      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it('preserves incarnation ID across store instances', () => {
      const ks1 = makeKernelStore(mockKernelDatabase);
      const incarnationId = ks1.provideIncarnationId();

      // Create a new store instance pointing to the same database
      const ks2 = makeKernelStore(mockKernelDatabase);
      const loaded = ks2.provideIncarnationId();

      expect(loaded).toBe(incarnationId);
    });

    it('regenerates incarnation ID after storage reset', () => {
      const ks = makeKernelStore(mockKernelDatabase);
      const original = ks.provideIncarnationId();

      // Reset storage (clears incarnationId since it's not in except list)
      ks.reset();

      const regenerated = ks.provideIncarnationId();

      expect(regenerated).not.toBe(original);
      expect(regenerated).toHaveLength(36);
    });

    it('preserves incarnation ID when reset with except list', () => {
      const ks = makeKernelStore(mockKernelDatabase);
      const original = ks.provideIncarnationId();

      // Reset with incarnationId in except list
      ks.reset({ except: ['incarnationId'] });

      const preserved = ks.provideIncarnationId();

      expect(preserved).toBe(original);
    });
  });
});
