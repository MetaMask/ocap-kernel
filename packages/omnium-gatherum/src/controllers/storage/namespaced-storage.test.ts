import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeNamespacedStorage } from './namespaced-storage.ts';
import type { StorageAdapter } from './types.ts';

describe('makeNamespacedStorage', () => {
  const mockAdapter: StorageAdapter = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockAdapter.get).mockResolvedValue(undefined);
    vi.mocked(mockAdapter.set).mockResolvedValue(undefined);
    vi.mocked(mockAdapter.delete).mockResolvedValue(undefined);
    vi.mocked(mockAdapter.keys).mockResolvedValue([]);
  });

  describe('get', () => {
    it('prefixes key with namespace', async () => {
      vi.mocked(mockAdapter.get).mockResolvedValue('value');

      const storage = makeNamespacedStorage('caplet', mockAdapter);
      const result = await storage.get('myKey');

      expect(result).toBe('value');
      expect(mockAdapter.get).toHaveBeenCalledWith('caplet.myKey');
    });

    it('returns undefined for non-existent key', async () => {
      vi.mocked(mockAdapter.get).mockResolvedValue(undefined);

      const storage = makeNamespacedStorage('caplet', mockAdapter);
      const result = await storage.get('nonExistent');

      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('prefixes key with namespace', async () => {
      const storage = makeNamespacedStorage('caplet', mockAdapter);
      await storage.set('myKey', 'myValue');

      expect(mockAdapter.set).toHaveBeenCalledWith('caplet.myKey', 'myValue');
    });

    it('handles complex values', async () => {
      const complexValue = { nested: { data: [1, 2, 3] } };

      const storage = makeNamespacedStorage('caplet', mockAdapter);
      await storage.set('complex', complexValue);

      expect(mockAdapter.set).toHaveBeenCalledWith(
        'caplet.complex',
        complexValue,
      );
    });
  });

  describe('delete', () => {
    it('prefixes key with namespace', async () => {
      const storage = makeNamespacedStorage('caplet', mockAdapter);
      await storage.delete('myKey');

      expect(mockAdapter.delete).toHaveBeenCalledWith('caplet.myKey');
    });
  });

  describe('has', () => {
    it('returns true when key exists', async () => {
      vi.mocked(mockAdapter.get).mockResolvedValue('value');

      const storage = makeNamespacedStorage('caplet', mockAdapter);
      const result = await storage.has('myKey');

      expect(result).toBe(true);
      expect(mockAdapter.get).toHaveBeenCalledWith('caplet.myKey');
    });

    it('returns false when key does not exist', async () => {
      vi.mocked(mockAdapter.get).mockResolvedValue(undefined);

      const storage = makeNamespacedStorage('caplet', mockAdapter);
      const result = await storage.has('nonExistent');

      expect(result).toBe(false);
    });
  });

  describe('keys', () => {
    it('returns keys with namespace prefix stripped', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue([
        'caplet.key1',
        'caplet.key2',
        'caplet.nested.key',
      ]);

      const storage = makeNamespacedStorage('caplet', mockAdapter);
      const result = await storage.keys();

      expect(result).toStrictEqual(['key1', 'key2', 'nested.key']);
      expect(mockAdapter.keys).toHaveBeenCalledWith('caplet.');
    });

    it('returns empty array when no keys in namespace', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue([]);

      const storage = makeNamespacedStorage('caplet', mockAdapter);
      const result = await storage.keys();

      expect(result).toStrictEqual([]);
    });
  });

  describe('clear', () => {
    it('deletes all keys in namespace', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue([
        'caplet.key1',
        'caplet.key2',
      ]);

      const storage = makeNamespacedStorage('caplet', mockAdapter);
      await storage.clear();

      expect(mockAdapter.delete).toHaveBeenCalledTimes(2);
      expect(mockAdapter.delete).toHaveBeenCalledWith('caplet.key1');
      expect(mockAdapter.delete).toHaveBeenCalledWith('caplet.key2');
    });

    it('does nothing when namespace is empty', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue([]);

      const storage = makeNamespacedStorage('caplet', mockAdapter);
      await storage.clear();

      expect(mockAdapter.delete).not.toHaveBeenCalled();
    });
  });

  describe('namespace isolation', () => {
    it('uses different prefixes for different namespaces', async () => {
      const storage1 = makeNamespacedStorage('caplet', mockAdapter);
      const storage2 = makeNamespacedStorage('service', mockAdapter);

      await storage1.set('key', 'value1');
      await storage2.set('key', 'value2');

      expect(mockAdapter.set).toHaveBeenCalledWith('caplet.key', 'value1');
      expect(mockAdapter.set).toHaveBeenCalledWith('service.key', 'value2');
    });
  });
});
