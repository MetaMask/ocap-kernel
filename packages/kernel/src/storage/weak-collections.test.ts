import type { Json } from '@metamask/utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { VatStore } from './vat-store.js';
import { WeakCollection } from './weak-collections.js';
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

describe('WeakCollection', () => {
  let mockStore: VatStore;
  let collection: WeakCollection<Json>;

  beforeEach(() => {
    mockStore = new VatStore(
      'v1',
      new TestDuplexStream(vi.fn()),
      new MessageResolver('v1'),
    );
    collection = new WeakCollection(1, mockStore, 'test-collection');
  });

  describe('constructor', () => {
    it('should create a collection with the given parameters', () => {
      const coll = new WeakCollection(1, mockStore, 'test');
      expect(coll.label).toBe('test');
    });
  });

  describe('init', () => {
    it('should store an object and initialize its reference count', async () => {
      const obj = { test: 'value' };
      await collection.init('key1', obj);

      const retrieved = await collection.get('key1');
      expect(retrieved).toStrictEqual(obj);
    });

    it('should only accept string keys', async () => {
      const obj = { test: 'value' };
      // @ts-expect-error Testing runtime type check
      await expect(async () => collection.init(123, obj)).rejects.toThrow(
        'Only string keys are supported',
      );
    });
  });

  describe('reference counting', () => {
    it('should track references correctly', async () => {
      const obj = { test: 'value' };
      await collection.init('key1', obj);
      await collection.addRef('key1');
      await collection.addRef('key1');
      await collection.removeRef('key1');

      // Object should still exist after removing one reference
      expect(await collection.has('key1')).toBe(true);

      await collection.removeRef('key1');
      await collection.removeRef('key1');

      // Object should be deleted after removing all references
      expect(await collection.has('key1')).toBe(false);
    });

    it('should handle multiple objects independently', async () => {
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };

      await collection.init('key1', obj1);
      await collection.init('key2', obj2);

      await collection.addRef('key1');
      await collection.removeRef('key2');

      expect(await collection.has('key1')).toBe(true);
      expect(await collection.has('key2')).toBe(false);
    });
  });

  describe('get', () => {
    it('should retrieve stored objects', async () => {
      const obj = { test: 'value' };
      await collection.init('key1', obj);

      const retrieved = await collection.get('key1');
      expect(retrieved).toStrictEqual(obj);
    });

    it('should return undefined for non-existent keys', async () => {
      const retrieved = await collection.get('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should remove objects and their reference counts', async () => {
      const obj = { test: 'value' };
      await collection.init('key1', obj);
      await collection.delete('key1');

      expect(await collection.has('key1')).toBe(false);
      expect(await collection.get('key1')).toBeUndefined();
    });

    it('should handle deleting non-existent keys', async () => {
      expect(await collection.delete('nonexistent')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for existing keys', async () => {
      const obj = { test: 'value' };
      await collection.init('key1', obj);

      expect(await collection.has('key1')).toBe(true);
    });

    it('should return false for non-existent keys', async () => {
      expect(await collection.has('nonexistent')).toBe(false);
    });
  });

  describe('complex objects', () => {
    it('should handle nested objects', async () => {
      const complex = {
        nested: {
          array: [1, 2, 3],
          object: { foo: 'bar' },
        },
        date: new Date('2024-01-01').toISOString(),
      };

      await collection.init('complex', complex);
      const retrieved = await collection.get('complex');
      expect(retrieved).toStrictEqual(complex);
    });
  });

  describe('multiple collections', () => {
    it('should maintain separate storage spaces', async () => {
      const collection1 = new WeakCollection(1, mockStore, 'test1');
      const collection2 = new WeakCollection(2, mockStore, 'test2');

      const obj1 = { id: 1 };
      const obj2 = { id: 2 };

      await collection1.init('key', obj1);
      await collection2.init('key', obj2);

      expect(await collection1.get('key')).toStrictEqual(obj1);
      expect(await collection2.get('key')).toStrictEqual(obj2);
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      // Simulate storage error by using an invalid store
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
        has: () => {
          throw new Error('Storage error');
        },
      } as unknown as VatStore;

      const errorCollection = new WeakCollection(1, invalidStore, 'error-test');
      await expect(async () =>
        errorCollection.init('key', { test: 'value' }),
      ).rejects.toThrow('Storage error');
    });

    it('should validate input types', async () => {
      await expect(async () =>
        // @ts-expect-error Testing runtime type check
        collection.init(null, { test: 'value' }),
      ).rejects.toThrow('Only string keys are supported');
    });
  });
});
