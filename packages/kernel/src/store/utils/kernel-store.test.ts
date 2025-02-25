import type { Message } from '@agoric/swingset-liveslots';
import type { KernelDatabase } from '@ocap/store';
import { describe, it, expect, beforeEach } from 'vitest';

import { makeMapKernelDatabase } from '../../../test/storage.ts';
import type { RunQueueItem } from '../../types.ts';
import { makeKernelStore } from '../kernel-store.ts';

/**
 * Mock Message: A stupid TS hack to allow trivial use of plain strings as if they
 * were Messages, since, for testing purposes here, all that's necessary to be a
 * "message" is to be stringifiable.
 *
 * @param str - A string.
 * @returns The same string coerced to type Message.
 */
function mm(str: string): Message {
  return str as unknown as Message;
}

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
        'addClistEntry',
        'addPromiseSubscriber',
        'allocateErefForKref',
        'clear',
        'decRefCount',
        'deleteKernelObject',
        'deleteKernelPromise',
        'dequeueRun',
        'enqueuePromiseMessage',
        'enqueueRun',
        'erefToKref',
        'forgetEref',
        'forgetKref',
        'getKernelPromise',
        'getKernelPromiseMessageQueue',
        'getNextRemoteId',
        'getNextVatId',
        'getOwner',
        'getRefCount',
        'getObjectRefCount',
        'incRefCount',
        'setObjectRefCount',
        'initEndpoint',
        'initKernelObject',
        'initKernelPromise',
        'krefToEref',
        'kv',
        'makeVatStore',
        'reset',
        'resolveKernelPromise',
        'runQueueLength',
        'setPromiseDecider',
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
      expect(ks.getRefCount('ko1')).toBe(1);
      expect(ks.incRefCount('ko1')).toBe(2);
      ks.incRefCount('ko1');
      expect(ks.getRefCount('ko1')).toBe(3);
      expect(ks.decRefCount('ko1')).toBe(2);
      ks.decRefCount('ko1');
      ks.decRefCount('ko1');
      expect(ks.getRefCount('ko1')).toBe(0);
      expect(ks.initKernelObject(ko2Owner)).toBe('ko2');
      expect(ks.getOwner('ko1')).toBe(ko1Owner);
      expect(ks.getOwner('ko2')).toBe(ko2Owner);
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
      ks.enqueuePromiseMessage('kp1', mm('first message to kp1'));
      ks.enqueuePromiseMessage('kp1', mm('second message to kp1'));
      expect(ks.getKernelPromiseMessageQueue('kp1')).toStrictEqual([
        'first message to kp1',
        'second message to kp1',
      ]);
      expect(ks.getKernelPromiseMessageQueue('kp1')).toStrictEqual([]);
      ks.enqueuePromiseMessage('kp1', mm('sacrificial message'));
      ks.deleteKernelPromise('kp1');
      expect(() => ks.getKernelPromise('kp1')).toThrow(
        'unknown kernel promise kp1',
      );
      expect(() => ks.enqueuePromiseMessage('kp1', mm('not really'))).toThrow(
        'queue kp1 not initialized',
      );
      expect(() => ks.getKernelPromiseMessageQueue('kp1')).toThrow(
        'queue kp1 not initialized',
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
      ks.addClistEntry('v2', 'ko42', 'o-63');
      ks.addClistEntry('v2', 'ko51', 'o-74');
      ks.addClistEntry('v2', 'kp60', 'p+85');
      ks.addClistEntry('r7', 'ko42', 'ro+11');
      ks.addClistEntry('r7', 'kp61', 'rp-99');
      expect(ks.krefToEref('v2', 'ko42')).toBe('o-63');
      expect(ks.erefToKref('v2', 'o-63')).toBe('ko42');
      expect(ks.krefToEref('v2', 'ko51')).toBe('o-74');
      expect(ks.erefToKref('v2', 'o-74')).toBe('ko51');
      expect(ks.krefToEref('v2', 'kp60')).toBe('p+85');
      expect(ks.erefToKref('v2', 'p+85')).toBe('kp60');
      expect(ks.krefToEref('r7', 'ko42')).toBe('ro+11');
      expect(ks.erefToKref('r7', 'ro+11')).toBe('ko42');
      expect(ks.krefToEref('r7', 'kp61')).toBe('rp-99');
      expect(ks.erefToKref('r7', 'rp-99')).toBe('kp61');
      ks.forgetKref('v2', 'ko42');
      expect(ks.krefToEref('v2', 'ko42')).toBeUndefined();
      expect(ks.erefToKref('v2', 'o-63')).toBeUndefined();
      ks.forgetEref('r7', 'rp-99');
      expect(ks.krefToEref('r7', 'kp61')).toBeUndefined();
      expect(ks.erefToKref('r7', 'rp-99')).toBeUndefined();
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
      ks.addClistEntry('v1', koId, 'o-1');
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
