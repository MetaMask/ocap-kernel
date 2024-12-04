import type { DuplexStream } from '@ocap/streams';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { VatStore } from './vat-store.js';
import { MessageResolver } from '../messages/index.js';
import type { VatCommand, VatCommandReply } from '../messages/index.js';
import type { VatId } from '../types.js';

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

describe('VatStore', () => {
  let vatStore: VatStore;
  let resolver: MessageResolver;
  let stream: DuplexStream<VatCommand, VatCommandReply>;
  const mockVatId: VatId = 'v1';
  const onDispatch = vi.fn();

  beforeEach(() => {
    stream = new TestDuplexStream<VatCommand, VatCommandReply>(onDispatch);
    resolver = new MessageResolver(mockVatId);
    vatStore = new VatStore(mockVatId, stream, resolver);
  });

  describe('set', () => {
    it('should store primitive values', async () => {
      await vatStore.set('string', 'test');
      await vatStore.set('number', 42);
      await vatStore.set('boolean', true);
      await vatStore.set('null', null);

      expect(await vatStore.get('string')).toBe('test');
      expect(await vatStore.get('number')).toBe(42);
      expect(await vatStore.get('boolean')).toBe(true);
      expect(await vatStore.get('null')).toBeNull();
    });

    it('should store complex objects', async () => {
      const testObject = {
        name: 'test',
        numbers: [1, 2, 3],
        nested: { foo: 'bar' },
      };

      await vatStore.set('complex', testObject);
      expect(await vatStore.get('complex')).toStrictEqual(testObject);
    });

    it('should overwrite existing values', async () => {
      await vatStore.set('key', 'initial');
      await vatStore.set('key', 'updated');
      expect(await vatStore.get('key')).toBe('updated');
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent keys', async () => {
      expect(await vatStore.get('nonexistent')).toBeUndefined();
    });

    it('should retrieve stored values', async () => {
      await vatStore.set('key', 'value');
      expect(await vatStore.get('key')).toBe('value');
    });

    it('should handle JSON parsing errors', async () => {
      await expect(async () => vatStore.get('invalid')).rejects.toThrow(
        'Failed to parse stored value for key "invalid"',
      );
    });
  });

  describe('has', () => {
    it('should return true for existing keys', async () => {
      await vatStore.set('exists', 'value');
      expect(await vatStore.has('exists')).toBe(true);
    });

    it('should return false for non-existent keys', async () => {
      expect(await vatStore.has('nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove existing keys', async () => {
      await vatStore.set('toDelete', 'value');
      expect(await vatStore.has('toDelete')).toBe(true);

      await vatStore.delete('toDelete');
      expect(await vatStore.has('toDelete')).toBe(false);
      expect(await vatStore.get('toDelete')).toBeUndefined();
    });

    it('should not throw when deleting non-existent keys', async () => {
      expect(await vatStore.delete('nonexistent')).toBeUndefined();
    });
  });

  describe('key prefixing', () => {
    it('should isolate data between different vat stores', async () => {
      const vatStore1 = new VatStore('v1', stream, resolver);
      const vatStore2 = new VatStore('v2', stream, resolver);

      await vatStore1.set('key', 'value1');
      await vatStore2.set('key', 'value2');

      expect(await vatStore1.get('key')).toBe('value1');
      expect(await vatStore2.get('key')).toBe('value2');
    });
  });
});
