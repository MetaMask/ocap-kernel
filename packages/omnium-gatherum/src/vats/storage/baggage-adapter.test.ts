import type { Baggage } from '@metamask/ocap-kernel';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { makeBaggageStorageAdapter } from './baggage-adapter.ts';

/**
 * Create a mock baggage store for testing.
 *
 * @returns A mock baggage implementation.
 */
function makeMockBaggage() {
  const store = new Map<string, unknown>();
  return {
    has: vi.fn((key: string) => store.has(key)),
    get: vi.fn((key: string) => store.get(key)),
    init: vi.fn((key: string, value: unknown) => {
      if (store.has(key)) {
        throw new Error(`Key "${key}" already exists`);
      }
      store.set(key, value);
    }),
    set: vi.fn((key: string, value: unknown) => {
      if (!store.has(key)) {
        throw new Error(`Key "${key}" does not exist`);
      }
      store.set(key, value);
    }),
    delete: vi.fn((key: string) => {
      store.delete(key);
    }),
    keys: vi.fn(() => store.keys()),
    _store: store, // For test inspection
  };
}

describe('makeBaggageStorageAdapter', () => {
  let baggage: ReturnType<typeof makeMockBaggage>;
  let adapter: ReturnType<typeof makeBaggageStorageAdapter>;

  beforeEach(() => {
    baggage = makeMockBaggage();
    adapter = makeBaggageStorageAdapter(baggage as unknown as Baggage);
  });

  describe('get', () => {
    it('returns undefined for non-existent key', async () => {
      const result = await adapter.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns stored value', async () => {
      baggage._store.set('test-key', { foo: 'bar' });
      const result = await adapter.get('test-key');
      expect(result).toStrictEqual({ foo: 'bar' });
    });

    it('returns undefined for deleted key', async () => {
      await adapter.set('to-delete', { data: 'test' });
      await adapter.delete('to-delete');

      expect(baggage._store.has('to-delete')).toBe(false);

      const result = await adapter.get('to-delete');
      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('initializes new key', async () => {
      await adapter.set('new-key', { value: 123 });
      expect(baggage.init).toHaveBeenCalled();
      expect(baggage._store.get('new-key')).toStrictEqual({ value: 123 });
    });

    it('updates existing key', async () => {
      await adapter.set('existing-key', { value: 1 });

      await adapter.set('existing-key', { value: 2 });

      expect(baggage.set).toHaveBeenCalled();
      expect(baggage._store.get('existing-key')).toStrictEqual({ value: 2 });
    });

    it('re-sets previously deleted key', async () => {
      await adapter.set('reused-key', { original: true });
      expect(await adapter.keys()).toContain('reused-key');

      await adapter.delete('reused-key');
      expect(await adapter.keys()).not.toContain('reused-key');
      expect(baggage._store.has('reused-key')).toBe(false);

      await adapter.set('reused-key', { restored: true });
      expect(await adapter.keys()).toContain('reused-key');
      expect(await adapter.get('reused-key')).toStrictEqual({ restored: true });
    });
  });

  describe('delete', () => {
    it('removes key from baggage', async () => {
      await adapter.set('to-delete', { data: 'test' });
      await adapter.delete('to-delete');

      expect(baggage._store.has('to-delete')).toBe(false);
      expect(baggage.delete).toHaveBeenCalledWith('to-delete');
      const keys = await adapter.keys();
      expect(keys).not.toContain('to-delete');
    });

    it('does nothing for non-existent key', async () => {
      await adapter.delete('nonexistent');
      expect(baggage.delete).not.toHaveBeenCalled();
      const keys = await adapter.keys();
      expect(keys).toStrictEqual([]);
    });
  });

  describe('keys', () => {
    it('returns empty array when no keys stored', async () => {
      const keys = await adapter.keys();
      expect(keys).toStrictEqual([]);
    });

    it('returns all keys', async () => {
      await adapter.set('alpha', 'a');
      await adapter.set('beta', 'b');
      await adapter.set('gamma', 'c');

      const keys = await adapter.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
      expect(keys).toContain('gamma');
    });

    it('filters by prefix', async () => {
      await adapter.set('caplet:foo', 'foo');
      await adapter.set('caplet:bar', 'bar');
      await adapter.set('other:baz', 'baz');

      const capletKeys = await adapter.keys('caplet:');
      expect(capletKeys).toHaveLength(2);
      expect(capletKeys).toContain('caplet:foo');
      expect(capletKeys).toContain('caplet:bar');
      expect(capletKeys).not.toContain('other:baz');
    });
  });
});
