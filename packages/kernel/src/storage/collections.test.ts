import { delay } from '@ocap/test-utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { Collection } from './collections.js';
import { VatStore } from './vat-store.js';
import { MessageResolver } from '../messages/index.js';

vi.mock('./proxy-store.js', () => ({
  ProxyStore: class {
    map = new Map<string, string>();

    constructor() {
      // Directly set invalid JSON in the store for testing
      this.map.set(`v1.vs.invalid`, '{invalid json}');
    }

    get = this.map.get.bind(this.map);

    set = this.map.set.bind(this.map);

    delete = this.map.delete.bind(this.map);

    has = this.map.has.bind(this.map);
  },
}));

describe('Collection', () => {
  let mockStore: VatStore;
  let collection: Collection;

  beforeEach(() => {
    mockStore = new VatStore(
      'v1',
      new TestDuplexStream(vi.fn()),
      new MessageResolver('v1'),
    );
    collection = new Collection(1, mockStore, 'test-collection');
  });

  describe('constructor', () => {
    it('should create a collection with the given parameters', () => {
      const coll = new Collection(1, mockStore, 'test');
      expect(coll.label).toBe('test');
      expect(coll.size).toBe(0);
    });

    it('should initialize metadata correctly', () => {
      const coll = new Collection(1, mockStore, 'test');
      expect(coll.size).toBe(0);
      expect(coll.label).toBe('test');
    });
  });

  describe('init', () => {
    it('should store a value and update entry count', async () => {
      await collection.init('key1', { test: 'value' });
      expect(collection.size).toBe(1);

      const retrieved = await collection.get('key1');
      expect(retrieved).toStrictEqual({ test: 'value' });
    });

    it('should only accept string keys', async () => {
      // @ts-expect-error Testing runtime type check
      await expect(collection.init(123, 'value')).rejects.toThrow(
        'Only string keys are supported',
      );
    });

    it('should handle multiple entries', async () => {
      await collection.init('key1', 'value1');
      await collection.init('key2', 'value2');

      expect(collection.size).toBe(2);
      expect(await collection.get('key1')).toBe('value1');
      expect(await collection.get('key2')).toBe('value2');
    });
  });

  describe('get', () => {
    it('should retrieve stored values', async () => {
      const testValue = { test: 'value' };
      await collection.init('key1', testValue);

      const retrieved = await collection.get('key1');
      expect(retrieved).toStrictEqual(testValue);
    });

    it('should return undefined for non-existent keys', async () => {
      const retrieved = await collection.get('nonexistent');
      expect(retrieved).toBeUndefined();
    });

    it('should handle different value types', async () => {
      await collection.init('string', 'test');
      await collection.init('number', 42);
      await collection.init('boolean', true);
      await collection.init('object', { foo: 'bar' });
      await collection.init('array', [1, 2, 3]);

      expect(await collection.get('string')).toBe('test');
      expect(await collection.get('number')).toBe(42);
      expect(await collection.get('boolean')).toBe(true);
      expect(await collection.get('object')).toStrictEqual({ foo: 'bar' });
      expect(await collection.get('array')).toStrictEqual([1, 2, 3]);
    });
  });

  describe('delete', () => {
    it('should remove entries and update entry count', async () => {
      await collection.init('key1', 'value1');
      expect(collection.size).toBe(1);

      await collection.delete('key1');
      expect(collection.size).toBe(0);
      expect(await collection.get('key1')).toBeUndefined();
    });

    it('should handle deleting non-existent keys', async () => {
      expect(await collection.delete('nonexistent')).toBeUndefined();
    });

    it('should maintain correct entry count after multiple operations', async () => {
      await collection.init('key1', 'value1');
      await collection.init('key2', 'value2');
      await collection.delete('key1');
      await collection.init('key3', 'value3');
      await collection.delete('key2');

      expect(collection.size).toBe(1);
      expect(await collection.get('key3')).toBe('value3');
    });
  });

  describe('metadata handling', () => {
    it('should persist metadata across instances', async () => {
      // First initialize the collection with some data
      await collection.init('key1', 'value1');
      expect(collection.size).toBe(1);

      // Create new collection instance with same ID and store
      const newCollection = new Collection(1, mockStore, 'test-collection');
      // Wait for the metadata to be loaded
      await delay(100);
      expect(newCollection.size).toBe(1);
      expect(await newCollection.get('key1')).toBe('value1');
    });

    it('should handle metadata loading errors gracefully', async () => {
      const invalidStore = {
        get: () => {
          throw new Error('Storage error');
        },
        set: () => {
          throw new Error('Storage error');
        },
        delete: () => {
          throw new Error('Storage error');
        },
      } as unknown as VatStore;

      const errorCollection = new Collection(1, invalidStore, 'error-test');
      expect(errorCollection.size).toBe(0);
    });
  });

  describe('multiple collections', () => {
    it('should maintain separate storage spaces', async () => {
      const collection1 = new Collection(1, mockStore, 'test1');
      const collection2 = new Collection(2, mockStore, 'test2');

      await collection1.init('key', 'value1');
      await collection2.init('key', 'value2');

      expect(await collection1.get('key')).toBe('value1');
      expect(await collection2.get('key')).toBe('value2');
      expect(collection1.size).toBe(1);
      expect(collection2.size).toBe(1);
    });
  });

  describe('size and label properties', () => {
    it('should track size correctly through operations', async () => {
      expect(collection.size).toBe(0);

      await collection.init('key1', 'value1');
      expect(collection.size).toBe(1);

      await collection.init('key2', 'value2');
      expect(collection.size).toBe(2);

      await collection.delete('key1');
      expect(collection.size).toBe(1);

      await collection.delete('key2');
      expect(collection.size).toBe(0);
    });

    it('should maintain correct label', () => {
      expect(collection.label).toBe('test-collection');

      const newCollection = new Collection(2, mockStore, 'different-label');
      expect(newCollection.label).toBe('different-label');
    });
  });
});
