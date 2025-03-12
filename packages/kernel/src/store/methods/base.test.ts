import type { KVStore } from '@ocap/store';
import { describe, it, expect, beforeEach } from 'vitest';

import { getBaseMethods } from './base.ts';
import { makeMapKVStore } from '../../../test/storage.ts';

describe('base-methods', () => {
  let kv: KVStore;
  let baseStore: ReturnType<typeof getBaseMethods>;

  beforeEach(() => {
    kv = makeMapKVStore();
    baseStore = getBaseMethods(kv);
  });

  describe('getSlotKey', () => {
    it('generates correct slot keys', () => {
      expect(baseStore.getSlotKey('v1', 'ko123')).toBe('v1.c.ko123');
      expect(baseStore.getSlotKey('r2', 'kp456')).toBe('r2.c.kp456');
    });
  });

  describe('incCounter', () => {
    it('increments a stored counter value', () => {
      // Create a stored value to increment
      const storedValue = baseStore.provideCachedStoredValue(
        'test-counter',
        '5',
      );

      // Increment and check return value
      expect(baseStore.incCounter(storedValue)).toBe('5');
      expect(storedValue.get()).toBe('6');

      // Increment again
      expect(baseStore.incCounter(storedValue)).toBe('6');
      expect(storedValue.get()).toBe('7');
    });
  });

  describe('provideCachedStoredValue', () => {
    it('creates a new value if it does not exist', () => {
      const value = baseStore.provideCachedStoredValue('new-key', 'initial');
      expect(value.get()).toBe('initial');
      expect(kv.get('new-key')).toBe('initial');
    });

    it('retrieves an existing value', () => {
      kv.set('existing-key', 'existing-value');
      const value = baseStore.provideCachedStoredValue('existing-key');
      expect(value.get()).toBe('existing-value');
    });

    it('caches values in memory', () => {
      const value = baseStore.provideCachedStoredValue('cached-key', 'initial');

      // Change the value through the stored value object
      value.set('updated');
      expect(value.get()).toBe('updated');
      expect(kv.get('cached-key')).toBe('updated');

      // Change the value directly in the KV store
      kv.set('cached-key', 'changed-externally');

      // The cached value should still return the cached value, not the updated KV store value
      // This is because the value is cached in memory
      expect(value.get()).toBe('updated');

      // But a new stored value object should see the updated KV store value
      const newValue = baseStore.provideCachedStoredValue('cached-key');
      expect(newValue.get()).toBe('changed-externally');
    });

    it('deletes values correctly', () => {
      const value = baseStore.provideCachedStoredValue(
        'delete-key',
        'to-delete',
      );
      expect(value.get()).toBe('to-delete');

      value.delete();
      expect(value.get()).toBeUndefined();
      expect(kv.get('delete-key')).toBeUndefined();
    });
  });

  describe('provideRawStoredValue', () => {
    it('creates a new value if it does not exist', () => {
      const value = baseStore.provideRawStoredValue('new-raw-key', 'initial');
      expect(value.get()).toBe('initial');
      expect(kv.get('new-raw-key')).toBe('initial');
    });

    it('retrieves an existing value', () => {
      kv.set('existing-raw-key', 'existing-value');
      const value = baseStore.provideRawStoredValue('existing-raw-key');
      expect(value.get()).toBe('existing-value');
    });

    it('does not cache values in memory', () => {
      const value = baseStore.provideRawStoredValue('raw-key', 'initial');

      // Change the value through the stored value object
      value.set('updated');
      expect(value.get()).toBe('updated');
      expect(kv.get('raw-key')).toBe('updated');

      // Change the value directly in the KV store
      kv.set('raw-key', 'changed-externally');

      // The raw value should always read from the KV store
      expect(value.get()).toBe('changed-externally');
    });

    it('deletes values correctly', () => {
      const value = baseStore.provideRawStoredValue(
        'delete-raw-key',
        'to-delete',
      );
      expect(value.get()).toBe('to-delete');

      value.delete();
      expect(value.get()).toBeUndefined();
      expect(kv.get('delete-raw-key')).toBeUndefined();
    });
  });

  describe('integration', () => {
    it('works with multiple stored values', () => {
      const counter1 = baseStore.provideCachedStoredValue('counter1', '1');
      const counter2 = baseStore.provideCachedStoredValue('counter2', '10');

      expect(baseStore.incCounter(counter1)).toBe('1');
      expect(baseStore.incCounter(counter2)).toBe('10');

      expect(counter1.get()).toBe('2');
      expect(counter2.get()).toBe('11');
    });

    it('supports both cached and raw stored values', () => {
      const cachedValue = baseStore.provideCachedStoredValue(
        'cached',
        'cached-value',
      );
      const rawValue = baseStore.provideRawStoredValue('raw', 'raw-value');

      expect(cachedValue.get()).toBe('cached-value');
      expect(rawValue.get()).toBe('raw-value');

      // Modify directly in KV store
      kv.set('cached', 'modified-cached');
      kv.set('raw', 'modified-raw');

      // Cached value should still return the cached value
      expect(cachedValue.get()).toBe('cached-value');
      // Raw value should return the updated value
      expect(rawValue.get()).toBe('modified-raw');
    });
  });
});
