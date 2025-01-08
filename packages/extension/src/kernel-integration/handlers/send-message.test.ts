import '@ocap/shims/endoify';
import type { Kernel, KVStore } from '@ocap/kernel';
import { describe, it, expect, vi } from 'vitest';

import { sendMessageHandler } from './send-message.js';

describe('sendMessageHandler', () => {
  const mockKernel = {
    sendMessage: vi.fn(() => 'success'),
    kvGet: vi.fn(),
    kvSet: vi.fn(),
  } as unknown as Kernel;

  const mockKVStore = {} as unknown as KVStore;

  it('should have the correct method', () => {
    expect(sendMessageHandler.method).toBe('sendMessage');
  });

  it('should handle kvGet command', async () => {
    vi.mocked(mockKernel.kvGet).mockReturnValue('value');
    const params = {
      payload: { method: 'kvGet', params: 'testKey' },
    };
    const result = await sendMessageHandler.implementation(
      mockKernel,
      mockKVStore,
      params,
    );
    expect(mockKernel.kvGet).toHaveBeenCalledWith('testKey');
    expect(result).toStrictEqual({ result: 'value' });
  });

  it('should throw error when key not found in kvGet', async () => {
    vi.mocked(mockKernel.kvGet).mockReturnValue(undefined);
    const params = {
      payload: { method: 'kvGet', params: 'nonexistentKey' },
    };
    await expect(
      sendMessageHandler.implementation(mockKernel, mockKVStore, params),
    ).rejects.toThrow('Key not found');
  });

  it('should handle kvSet command', async () => {
    const params = {
      payload: {
        method: 'kvSet',
        params: { key: 'testKey', value: 'testValue' },
      },
    };
    const result = await sendMessageHandler.implementation(
      mockKernel,
      mockKVStore,
      params,
    );
    expect(mockKernel.kvSet).toHaveBeenCalledWith('testKey', 'testValue');
    expect(result).toStrictEqual({ key: 'testKey', value: 'testValue' });
  });

  it('should handle vat messages', async () => {
    const params = {
      id: 'v0',
      payload: { method: 'ping', params: null },
    } as const;
    const result = await sendMessageHandler.implementation(
      mockKernel,
      mockKVStore,
      params,
    );
    expect(mockKernel.sendMessage).toHaveBeenCalledWith('v0', {
      method: 'ping',
      params: null,
    });
    expect(result).toStrictEqual({ result: 'success' });
  });

  it('should throw error when vat ID is missing', async () => {
    const params = {
      payload: { method: 'ping', params: null },
    };
    await expect(
      sendMessageHandler.implementation(mockKernel, mockKVStore, params),
    ).rejects.toThrow('Vat ID required for this command');
  });
});
