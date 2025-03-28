import type { KVStore } from '@ocap/store';
import { describe, it, expect, beforeEach } from 'vitest';

import { getRefCountMethods } from './refcount.ts';
import { makeMapKVStore } from '../../../test/storage.ts';
import type { KRef } from '../../types.ts';
import type { StoreContext } from '../types.ts';

describe('refcount-methods', () => {
  let kv: KVStore;
  let refCountStore: ReturnType<typeof getRefCountMethods>;

  beforeEach(() => {
    kv = makeMapKVStore();
    refCountStore = getRefCountMethods({ kv } as StoreContext);
  });

  describe('refCountKey', () => {
    it('generates correct reference count keys', () => {
      expect(refCountStore.refCountKey('ko1')).toBe('ko1.refCount');
      expect(refCountStore.refCountKey('kp42')).toBe('kp42.refCount');
      expect(refCountStore.refCountKey('v7')).toBe('v7.refCount');
    });
  });

  describe('getRefCount', () => {
    it('returns 0 for non-existent references', () => {
      kv.set(refCountStore.refCountKey('ko99'), '0');
      expect(refCountStore.getRefCount('ko99')).toBe(0);
    });

    it('handles undefined values by returning NaN', () => {
      expect(Number.isNaN(refCountStore.getRefCount('nonexistent'))).toBe(true);
    });

    it('returns the correct reference count for existing references', () => {
      const kref: KRef = 'ko1';
      kv.set(`${kref}.refCount`, '5');
      expect(refCountStore.getRefCount(kref)).toBe(5);
    });
  });

  describe('incRefCount', () => {
    it('initializes and increments reference count for new references', () => {
      const kref: KRef = 'ko1';

      kv.set(refCountStore.refCountKey(kref), '0');

      expect(refCountStore.incRefCount(kref)).toBe(1);
      expect(kv.get(`${kref}.refCount`)).toBe('1');

      expect(refCountStore.incRefCount(kref)).toBe(2);
      expect(kv.get(`${kref}.refCount`)).toBe('2');
    });

    it('handles incrementing from undefined', () => {
      const kref: KRef = 'ko2';
      expect(Number.isNaN(refCountStore.incRefCount(kref))).toBe(true);
      expect(kv.get(refCountStore.refCountKey(kref))).toBe('NaN');
    });

    it('increments existing reference counts', () => {
      const kref: KRef = 'kp42';
      kv.set(`${kref}.refCount`, '10');

      expect(refCountStore.incRefCount(kref)).toBe(11);
      expect(kv.get(`${kref}.refCount`)).toBe('11');
    });
  });

  describe('decRefCount', () => {
    it('decrements reference counts correctly', () => {
      const kref: KRef = 'ko1';
      kv.set(`${kref}.refCount`, '5');

      expect(refCountStore.decRefCount(kref)).toBe(4);
      expect(kv.get(`${kref}.refCount`)).toBe('4');

      expect(refCountStore.decRefCount(kref)).toBe(3);
      expect(kv.get(`${kref}.refCount`)).toBe('3');
    });

    it('can decrement to zero', () => {
      const kref: KRef = 'ko1';
      kv.set(`${kref}.refCount`, '1');

      expect(refCountStore.decRefCount(kref)).toBe(0);
      expect(kv.get(`${kref}.refCount`)).toBe('0');
    });

    it('can decrement below zero (though this should be avoided in practice)', () => {
      const kref: KRef = 'ko1';
      kv.set(`${kref}.refCount`, '0');

      expect(refCountStore.decRefCount(kref)).toBe(-1);
      expect(kv.get(`${kref}.refCount`)).toBe('-1');
    });
  });

  describe('kernelRefExists', () => {
    it('returns false for non-existent references', () => {
      expect(refCountStore.kernelRefExists('ko99')).toBe(false);
    });

    it('returns true for existing references with non-zero count', () => {
      const kref: KRef = 'ko1';
      kv.set(`${kref}.refCount`, '5');
      expect(refCountStore.kernelRefExists(kref)).toBe(true);
    });

    it('returns true for existing references with zero count', () => {
      const kref: KRef = 'ko1';
      kv.set(`${kref}.refCount`, '0');
      expect(refCountStore.kernelRefExists(kref)).toBe(true);
    });
  });

  describe('integration', () => {
    it('supports full reference counting lifecycle', () => {
      const kref: KRef = 'ko42';

      expect(refCountStore.kernelRefExists(kref)).toBe(false);

      kv.set(refCountStore.refCountKey(kref), '0');
      expect(refCountStore.getRefCount(kref)).toBe(0);

      expect(refCountStore.kernelRefExists(kref)).toBe(true);

      expect(refCountStore.incRefCount(kref)).toBe(1);

      refCountStore.incRefCount(kref);
      refCountStore.incRefCount(kref);
      expect(refCountStore.getRefCount(kref)).toBe(3);

      refCountStore.decRefCount(kref);
      expect(refCountStore.getRefCount(kref)).toBe(2);

      refCountStore.decRefCount(kref);
      refCountStore.decRefCount(kref);
      expect(refCountStore.getRefCount(kref)).toBe(0);

      expect(refCountStore.kernelRefExists(kref)).toBe(true);
    });

    it('works with multiple references simultaneously', () => {
      const kref1: KRef = 'ko1';
      const kref2: KRef = 'kp2';

      kv.set(refCountStore.refCountKey(kref1), '0');
      kv.set(refCountStore.refCountKey(kref2), '0');

      refCountStore.incRefCount(kref1);
      refCountStore.incRefCount(kref2);
      refCountStore.incRefCount(kref2);

      expect(refCountStore.getRefCount(kref1)).toBe(1);
      expect(refCountStore.getRefCount(kref2)).toBe(2);

      refCountStore.decRefCount(kref1);
      expect(refCountStore.getRefCount(kref1)).toBe(0);
      expect(refCountStore.getRefCount(kref2)).toBe(2);
    });
  });
});
