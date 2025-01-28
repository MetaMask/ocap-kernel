import '@ocap/test-utils/mock-endoify';
import type { Kernel, KVStore } from '@ocap/kernel';
import { describe, it, expect, vi } from 'vitest';

import { sendMessageHandler } from './send-message.js';

describe('sendMessageHandler', () => {
  const mockKernel = {
    sendMessage: vi.fn(() => 'success'),
  } as unknown as Kernel;

  const mockKVStore = {} as unknown as KVStore;

  it('should have the correct method', () => {
    expect(sendMessageHandler.method).toBe('sendMessage');
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
