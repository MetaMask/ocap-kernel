import { describe, it, expect, beforeEach } from 'vitest';

import {
  Baggage,
  BAGGAGE_ID,
  NEXT_COLLECTION_ID,
  STORAGE_VERSION,
} from './baggage';
import { Collection } from './collections';
import { VatStore } from './vat-store';
import { WeakCollection } from './weak-collections';
import { makeMapKVStore } from '../../test/storage';

describe('Baggage', () => {
  let mockStore: VatStore;
  let baggage: Baggage;

  beforeEach(async () => {
    const kvStore = makeMapKVStore();
    mockStore = new VatStore('v1', kvStore);
    baggage = await Baggage.create(mockStore);
  });

  describe('create', () => {
    it('should initialize baggage with correct initial state', async () => {
      expect(baggage).toBeInstanceOf(Baggage);
      expect(await baggage.get('test')).toBeUndefined();
    });

    it('should initialize store with correct values', async () => {
      expect(await mockStore.get(BAGGAGE_ID)).toBe(STORAGE_VERSION);
      expect(await mockStore.get(NEXT_COLLECTION_ID)).toBe(2);
    });

    it('should maintain state across instances', async () => {
      await baggage.set('testKey', 'testValue');
      const newBaggage = await Baggage.create(mockStore);
      expect(await newBaggage.get('testKey')).toBe('testValue');
    });

    it('should maintain collection IDs across instances', async () => {
      await baggage.createCollection('test1');
      await baggage.createCollection('test2');
      const newBaggage = await Baggage.create(mockStore);
      const collection3 = await newBaggage.createCollection('test3');
      expect(collection3).toBeInstanceOf(Collection);
      expect(await mockStore.get(NEXT_COLLECTION_ID)).toBe(5);
    });

    it.each(['invalid', 'NaN', 'Infinity', '-Infinity', ''])(
      'should handle invalid nextId values: %s',
      async (invalid) => {
        // Test various invalid values
        await mockStore.set(NEXT_COLLECTION_ID, invalid);
        await mockStore.set(NEXT_COLLECTION_ID, invalid);
        const newBaggage = await Baggage.create(mockStore);
        const collection = await newBaggage.createCollection('test');
        expect(collection).toBeInstanceOf(Collection);
        expect(await mockStore.get(NEXT_COLLECTION_ID)).toBe(3);
      },
    );
  });

  describe('get/set', () => {
    it('should store and retrieve values', async () => {
      await baggage.set('key1', 'value1');
      expect(await baggage.get('key1')).toBe('value1');
    });

    it('should handle complex objects', async () => {
      const complex = {
        nested: { foo: 'bar' },
        array: [1, 2, 3],
        date: new Date('2024-01-01').toISOString(),
      };
      await baggage.set('complex', complex);
      expect(await baggage.get('complex')).toStrictEqual(complex);
    });

    it('should return undefined for non-existent keys', async () => {
      expect(await baggage.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing values', async () => {
      await baggage.set('key', 'value1');
      await baggage.set('key', 'value2');
      expect(await baggage.get('key')).toBe('value2');
    });
  });

  describe('createCollection', () => {
    it('should create a new Collection with unique ID', async () => {
      const collection1 = await baggage.createCollection('test1');
      const collection2 = await baggage.createCollection('test2');
      expect(collection1).toBeInstanceOf(Collection);
      expect(collection2).toBeInstanceOf(Collection);
      expect(collection1.label).toBe('test1');
      expect(collection2.label).toBe('test2');
    });

    it('should create collections that work independently', async () => {
      const collection1 = await baggage.createCollection<string>('test1');
      const collection2 = await baggage.createCollection<number>('test2');
      await collection1.init('key', 'value');
      await collection2.init('key', 42);
      expect(await collection1.get('key')).toBe('value');
      expect(await collection2.get('key')).toBe(42);
    });

    it('should increment collection IDs correctly', async () => {
      await baggage.createCollection('test1');
      await baggage.createCollection('test2');
      await baggage.createCollection('test3');
      expect(await mockStore.get(NEXT_COLLECTION_ID)).toBe(5);
    });
  });

  describe('createWeakCollection', () => {
    it('should create a new WeakCollection with unique ID', async () => {
      const collection1 = await baggage.createWeakCollection('test1');
      const collection2 = await baggage.createWeakCollection('test2');
      expect(collection1).toBeInstanceOf(WeakCollection);
      expect(collection2).toBeInstanceOf(WeakCollection);
      expect(collection1.label).toBe('test1');
      expect(collection2.label).toBe('test2');
    });

    it('should create weak collections that work independently', async () => {
      const collection1 = await baggage.createWeakCollection<{ value: string }>(
        'test1',
      );
      const collection2 = await baggage.createWeakCollection<{ value: number }>(
        'test2',
      );
      const obj1 = { value: 'test' };
      const obj2 = { value: 42 };
      await collection1.init('key', obj1);
      await collection2.init('key', obj2);
      expect(await collection1.get('key')).toStrictEqual(obj1);
      expect(await collection2.get('key')).toStrictEqual(obj2);
    });

    it('should handle reference counting in weak collections', async () => {
      const collection = await baggage.createWeakCollection<{ value: string }>(
        'test',
      );
      const obj = { value: 'test' };
      await collection.init('key', obj);
      await collection.addRef('key');
      await collection.addRef('key');
      await collection.removeRef('key');
      expect(await collection.get('key')).toStrictEqual(obj);
      await collection.removeRef('key');
      await collection.removeRef('key');
      expect(await collection.get('key')).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle store initialization failures', async () => {
      const invalidStore = {
        get: () => {
          throw new Error('Storage error');
        },
        set: () => {
          throw new Error('Storage error');
        },
      } as unknown as VatStore;
      await expect(Baggage.create(invalidStore)).rejects.toThrow(
        'Storage error',
      );
    });

    it('should handle collection creation failures', async () => {
      const invalidStore = {
        get: async () => Promise.resolve(2),
        set: () => {
          throw new Error('Storage error');
        },
      } as unknown as VatStore;
      const errorBaggage = new Baggage(invalidStore);
      await expect(errorBaggage.createCollection('test')).rejects.toThrow(
        Error,
      );
    });
  });
});
