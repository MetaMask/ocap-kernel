import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';
import { describe, it, expect, vi } from 'vitest';

import { sendVatCommandHandler } from './send-vat-command.ts';

describe('sendVatCommandHandler', () => {
  const mockKernel = {
    sendVatCommand: vi.fn(() => 'success'),
  } as unknown as Kernel;

  const mockKVStore = {} as unknown as KVStore;

  it('should have the correct method', () => {
    expect(sendVatCommandHandler.method).toBe('sendVatCommand');
  });

  it('should handle vat messages', async () => {
    const params = {
      id: 'v0',
      payload: { method: 'ping', params: null },
    } as const;
    const result = await sendVatCommandHandler.implementation(
      mockKernel,
      mockKVStore,
      params,
    );
    expect(mockKernel.sendVatCommand).toHaveBeenCalledWith('v0', {
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
      sendVatCommandHandler.implementation(mockKernel, mockKVStore, params),
    ).rejects.toThrow('Vat ID required for this command');
  });
});
