import { describe, it, expect, beforeEach } from 'vitest';

import { Baggage } from './baggage';
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
      expect(await mockStore.get('baggageID')).toBe('o+d6/1');
      expect(await mockStore.get('nextCollectionId')).toBe(2);
    });
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
      const collection1 = await baggage.createCollection('test1');
      const collection2 = await baggage.createCollection('test2');
      const collection3 = await baggage.createCollection('test3');

      // Test internal implementation detail: collections should have sequential IDs
      expect(await mockStore.get('nextCollectionId')).toBe(5);
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

  //   describe('persistence', () => {
  //     it('should maintain state across instances', async () => {
  //       await baggage.set('key', 'value');

  //       // Create new baggage instance with same store
  //       const newBaggage = new Baggage(mockStore);
  //       await newBaggage.#ensureInitialized();

  //       expect(await newBaggage.get('key')).toBe('value');
  //     });

  //     it('should maintain collection IDs across instances', async () => {
  //       const collection1 = await baggage.createCollection('test1');
  //       await collection1.init('key', 'value');

  //       // Create new baggage instance
  //       const newBaggage = new Baggage(mockStore);
  //       await newBaggage.#ensureInitialized();

  //       const collection2 = await newBaggage.createCollection('test2');
  //       expect(collection2).toBeInstanceOf(Collection);
  //       // Verify that collection IDs continue from previous instance
  //       expect(await mockStore.get('nextCollectionId')).toBe(4);
  //     });
  //   });

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
