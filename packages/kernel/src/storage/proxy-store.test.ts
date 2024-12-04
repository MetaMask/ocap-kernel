import { TestDuplexStream } from '@ocap/test-utils/streams';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ProxyStore } from './proxy-store.js';
import {
  MessageResolver,
  VatCommandMethod,
  VatStorageMethod,
} from '../messages/index.js';
import type { VatCommand, VatCommandReply } from '../messages/index.js';

describe('ProxyStore', () => {
  let proxyStore: ProxyStore;
  let mockStream: TestDuplexStream<VatCommand, VatCommandReply>;
  let mockResolver: MessageResolver;
  const mockVatId = 'v1';

  beforeEach(() => {
    mockStream = {
      write: vi.fn(),
      next: vi.fn(),
      return: vi.fn(),
      drain: vi.fn(),
      throw: vi.fn(),
      [Symbol.asyncIterator]: vi.fn(() => mockStream),
    } as unknown as TestDuplexStream<VatCommand, VatCommandReply>;
    mockResolver = new MessageResolver(mockVatId);
    proxyStore = new ProxyStore(mockStream, mockResolver);
  });

  describe('get', () => {
    it('should send correct get command and handle string response', async () => {
      const testKey = 'testKey';
      const expectedValue = 'testValue';
      // Mock resolver to return expected value
      vi.spyOn(mockResolver, 'createMessage').mockImplementation(
        async (sendMessage) => {
          sendMessage('msg1').catch(() => undefined);
          return { params: expectedValue };
        },
      );
      const result = await proxyStore.get(testKey);
      expect(result).toBe(expectedValue);
      expect(mockStream.write).toHaveBeenCalledWith({
        id: 'msg1',
        payload: {
          method: VatCommandMethod.storage,
          params: { method: VatStorageMethod.get, params: testKey },
        },
      });
    });

    it('should handle undefined response', async () => {
      vi.spyOn(mockResolver, 'createMessage').mockResolvedValue(undefined);
      const result = await proxyStore.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should handle direct response without params wrapper', async () => {
      const directValue = 'direct value';
      vi.spyOn(mockResolver, 'createMessage').mockResolvedValue(directValue);
      const result = await proxyStore.get('key');
      expect(result).toBe(directValue);
    });
  });

  describe('set', () => {
    it('should send correct set command', async () => {
      const testKey = 'testKey';
      const testValue = 'testValue';
      vi.spyOn(mockResolver, 'createMessage').mockImplementation(
        async (sendMessage) => {
          sendMessage('msg1').catch(() => undefined);
          return undefined;
        },
      );
      await proxyStore.set(testKey, testValue);
      expect(mockStream.write).toHaveBeenCalledWith({
        id: 'msg1',
        payload: {
          method: VatCommandMethod.storage,
          params: {
            method: VatStorageMethod.set,
            params: { key: testKey, value: testValue },
          },
        },
      });
    });

    it('should handle set operation errors', async () => {
      const error = new Error('Set operation failed');
      vi.spyOn(mockResolver, 'createMessage').mockRejectedValue(error);
      await expect(proxyStore.set('key', 'value')).rejects.toThrow(error);
    });
  });

  describe('delete', () => {
    it('should send correct delete command', async () => {
      const testKey = 'testKey';
      vi.spyOn(mockResolver, 'createMessage').mockImplementation(
        async (sendMessage) => {
          sendMessage('msg1').catch(() => undefined);
          return undefined;
        },
      );
      await proxyStore.delete(testKey);
      expect(mockStream.write).toHaveBeenCalledWith({
        id: 'msg1',
        payload: {
          method: VatCommandMethod.storage,
          params: { method: VatStorageMethod.delete, params: testKey },
        },
      });
    });

    it('should handle delete operation errors', async () => {
      const error = new Error('Delete operation failed');
      vi.spyOn(mockResolver, 'createMessage').mockRejectedValue(error);
      await expect(proxyStore.delete('key')).rejects.toThrow(error);
    });
  });
});
