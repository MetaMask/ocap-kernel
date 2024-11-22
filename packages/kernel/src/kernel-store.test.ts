import { describe, it, expect, beforeEach } from 'vitest';

import { makeKernelStore } from './kernel-store.js';
import type { KVStore } from './kernel-store.js';
import type { Message } from './types.js';
import { makeMapKVStore } from '../test/storage.js';

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

describe('kernel store', () => {
  let mockKVStore: KVStore;

  beforeEach(() => {
    mockKVStore = makeMapKVStore();
  });

  describe('initialization', () => {
    it('has a working KV store', () => {
      const ks = makeKernelStore(mockKVStore);
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
      const ks = makeKernelStore(mockKVStore);
      expect(Object.keys(ks).sort()).toStrictEqual([
        'addClistEntry',
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
        'incRefCount',
        'initKernelObject',
        'initKernelPromise',
        'krefToEref',
        'kv',
      ]);
    });
  });

  describe('kernel entity management', () => {
    it('generates IDs', () => {
      const ks = makeKernelStore(mockKVStore);
      expect(ks.getNextVatId()).toBe('v1');
      expect(ks.getNextVatId()).toBe('v2');
      expect(ks.getNextVatId()).toBe('v3');
      expect(ks.getNextRemoteId()).toBe('r1');
      expect(ks.getNextRemoteId()).toBe('r2');
      expect(ks.getNextRemoteId()).toBe('r3');
    });
    it('manages kernel objects', () => {
      const ks = makeKernelStore(mockKVStore);
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
      const ks = makeKernelStore(mockKVStore);
      const kp1 = {
        decider: 'v23',
        state: 'unresolved',
        subscribers: [],
      };
      const kp2 = {
        decider: 'r47',
        state: 'unresolved',
        subscribers: [],
      };
      expect(ks.initKernelPromise('v23')).toStrictEqual(['kp1', kp1]);
      expect(ks.getRefCount('kp1')).toBe(1);
      expect(ks.incRefCount('kp1')).toBe(2);
      ks.incRefCount('kp1');
      expect(ks.getRefCount('kp1')).toBe(3);
      expect(ks.decRefCount('kp1')).toBe(2);
      ks.decRefCount('kp1');
      ks.decRefCount('kp1');
      expect(ks.getRefCount('kp1')).toBe(0);
      expect(ks.initKernelPromise('r47')).toStrictEqual(['kp2', kp2]);
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
      const ks = makeKernelStore(mockKVStore);
      ks.enqueueRun(mm('first message'));
      ks.enqueueRun(mm('second message'));
      expect(ks.dequeueRun()).toBe('first message');
      ks.enqueueRun(mm('third message'));
      expect(ks.dequeueRun()).toBe('second message');
      expect(ks.dequeueRun()).toBe('third message');
      expect(ks.dequeueRun()).toBeUndefined();
      ks.enqueueRun(mm('fourth message'));
      expect(ks.dequeueRun()).toBe('fourth message');
      expect(ks.dequeueRun()).toBeUndefined();
    });
    it('manages clists', () => {
      const ks = makeKernelStore(mockKVStore);
      ks.addClistEntry('v2', 'ko42', 'vo-63');
      ks.addClistEntry('v2', 'ko51', 'vo-74');
      ks.addClistEntry('v2', 'kp60', 'vp+85');
      ks.addClistEntry('r7', 'ko42', 'ro+11');
      ks.addClistEntry('r7', 'kp61', 'rp-99');
      expect(ks.krefToEref('v2', 'ko42')).toBe('vo-63');
      expect(ks.erefToKref('v2', 'vo-63')).toBe('ko42');
      expect(ks.krefToEref('v2', 'ko51')).toBe('vo-74');
      expect(ks.erefToKref('v2', 'vo-74')).toBe('ko51');
      expect(ks.krefToEref('v2', 'kp60')).toBe('vp+85');
      expect(ks.erefToKref('v2', 'vp+85')).toBe('kp60');
      expect(ks.krefToEref('r7', 'ko42')).toBe('ro+11');
      expect(ks.erefToKref('r7', 'ro+11')).toBe('ko42');
      expect(ks.krefToEref('r7', 'kp61')).toBe('rp-99');
      expect(ks.erefToKref('r7', 'rp-99')).toBe('kp61');
      ks.forgetKref('v2', 'ko42');
      expect(ks.krefToEref('v2', 'ko42')).toBeUndefined();
      expect(ks.erefToKref('v2', 'vo-63')).toBeUndefined();
      ks.forgetEref('r7', 'rp-99');
      expect(ks.krefToEref('r7', 'kp61')).toBeUndefined();
      expect(ks.erefToKref('r7', 'rp-99')).toBeUndefined();
    });
  });
});
