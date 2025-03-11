import type { KVStore } from '@ocap/store';
import { describe, it, expect, beforeEach } from 'vitest';

import { makeBaseStore } from './base-store.ts';
import { makeMapKVStore } from '../../test/storage.ts';

describe('base-store', () => {
  let mockKVStore: KVStore;
  let baseStore: ReturnType<typeof makeBaseStore>;

  beforeEach(() => {
    mockKVStore = makeMapKVStore();
    baseStore = makeBaseStore(mockKVStore);
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
      expect(mockKVStore.get('new-key')).toBe('initial');
    });

    it('retrieves an existing value', () => {
      mockKVStore.set('existing-key', 'existing-value');
      const value = baseStore.provideCachedStoredValue('existing-key');
      expect(value.get()).toBe('existing-value');
    });

    it('caches values in memory', () => {
      const value = baseStore.provideCachedStoredValue('cached-key', 'initial');

      // Change the value through the stored value object
      value.set('updated');
      expect(value.get()).toBe('updated');
      expect(mockKVStore.get('cached-key')).toBe('updated');

      // Change the value directly in the KV store
      mockKVStore.set('cached-key', 'changed-externally');

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
      expect(mockKVStore.get('delete-key')).toBeUndefined();
    });
  });

  describe('provideRawStoredValue', () => {
    it('creates a new value if it does not exist', () => {
      const value = baseStore.provideRawStoredValue('new-raw-key', 'initial');
      expect(value.get()).toBe('initial');
      expect(mockKVStore.get('new-raw-key')).toBe('initial');
    });

    it('retrieves an existing value', () => {
      mockKVStore.set('existing-raw-key', 'existing-value');
      const value = baseStore.provideRawStoredValue('existing-raw-key');
      expect(value.get()).toBe('existing-value');
    });

    it('does not cache values in memory', () => {
      const value = baseStore.provideRawStoredValue('raw-key', 'initial');

      // Change the value through the stored value object
      value.set('updated');
      expect(value.get()).toBe('updated');
      expect(mockKVStore.get('raw-key')).toBe('updated');

      // Change the value directly in the KV store
      mockKVStore.set('raw-key', 'changed-externally');

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
      expect(mockKVStore.get('delete-raw-key')).toBeUndefined();
    });
  });

  describe('maybeFreeKrefs', () => {
    it('maintains a set of krefs that might need to be freed', () => {
      expect(baseStore.maybeFreeKrefs.size).toBe(0);

      baseStore.maybeFreeKrefs.add('ko1');
      baseStore.maybeFreeKrefs.add('kp2');

      expect(baseStore.maybeFreeKrefs.size).toBe(2);
      expect(baseStore.maybeFreeKrefs.has('ko1')).toBe(true);
      expect(baseStore.maybeFreeKrefs.has('kp2')).toBe(true);

      baseStore.maybeFreeKrefs.delete('ko1');
      expect(baseStore.maybeFreeKrefs.size).toBe(1);
      expect(baseStore.maybeFreeKrefs.has('ko1')).toBe(false);
      expect(baseStore.maybeFreeKrefs.has('kp2')).toBe(true);

      baseStore.maybeFreeKrefs.clear();
      expect(baseStore.maybeFreeKrefs.size).toBe(0);
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
      mockKVStore.set('cached', 'modified-cached');
      mockKVStore.set('raw', 'modified-raw');

      // Cached value should still return the cached value
      expect(cachedValue.get()).toBe('cached-value');
      // Raw value should return the updated value
      expect(rawValue.get()).toBe('modified-raw');
    });
  });
});
