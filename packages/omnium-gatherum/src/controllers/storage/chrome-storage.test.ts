import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeChromeStorageAdapter } from './chrome-storage.ts';

describe('makeChromeStorageAdapter', () => {
  const mockStorage = {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(() => {
    mockStorage.get.mockResolvedValue({});
  });

  describe('get', () => {
    it('returns value for existing key', async () => {
      mockStorage.get.mockResolvedValue({ testKey: 'testValue' });

      const adapter = makeChromeStorageAdapter(
        mockStorage as unknown as chrome.storage.StorageArea,
      );
      const result = await adapter.get('testKey');

      expect(result).toBe('testValue');
      expect(mockStorage.get).toHaveBeenCalledWith('testKey');
    });

    it('returns undefined for non-existent key', async () => {
      mockStorage.get.mockResolvedValue({});

      const adapter = makeChromeStorageAdapter(
        mockStorage as unknown as chrome.storage.StorageArea,
      );
      const result = await adapter.get('nonExistent');

      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('sets a value', async () => {
      const adapter = makeChromeStorageAdapter(
        mockStorage as unknown as chrome.storage.StorageArea,
      );
      await adapter.set('key', 'value');

      expect(mockStorage.set).toHaveBeenCalledWith({ key: 'value' });
    });
  });

  describe('delete', () => {
    it('deletes a key', async () => {
      const adapter = makeChromeStorageAdapter(
        mockStorage as unknown as chrome.storage.StorageArea,
      );
      await adapter.delete('keyToDelete');

      expect(mockStorage.remove).toHaveBeenCalledWith('keyToDelete');
    });
  });

  describe('keys', () => {
    it('returns all keys when no prefix provided', async () => {
      mockStorage.get.mockResolvedValue({
        key1: 'value1',
        key2: 'value2',
        other: 'value3',
      });

      const adapter = makeChromeStorageAdapter(
        mockStorage as unknown as chrome.storage.StorageArea,
      );
      const result = await adapter.keys();

      expect(result).toStrictEqual(['key1', 'key2', 'other']);
      expect(mockStorage.get).toHaveBeenCalledWith(null);
    });

    it('filters keys by prefix', async () => {
      mockStorage.get.mockResolvedValue({
        'prefix.key1': 'value1',
        'prefix.key2': 'value2',
        other: 'value3',
      });

      const adapter = makeChromeStorageAdapter(
        mockStorage as unknown as chrome.storage.StorageArea,
      );
      const result = await adapter.keys('prefix.');

      expect(result).toStrictEqual(['prefix.key1', 'prefix.key2']);
    });
  });
});
