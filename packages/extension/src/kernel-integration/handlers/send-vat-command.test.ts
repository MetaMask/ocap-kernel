import type { VatId, Kernel } from '@ocap/kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { sendVatCommandHandler } from './send-vat-command.ts';

describe('sendVatCommandHandler', () => {
  let mockKernel: Kernel;
  beforeEach(() => {
    mockKernel = {
      sendVatCommand: vi.fn(),
    } as unknown as Kernel;
  });

  it('sends a command to a vat', async () => {
    const vatId = 'vat1' as VatId;
    vi.mocked(mockKernel.sendVatCommand).mockResolvedValueOnce('foo');

    const result = await sendVatCommandHandler.implementation(
      { kernel: mockKernel },
      {
        id: vatId,
        payload: {
          id: 'test-id',
          jsonrpc: '2.0',
          method: 'ping',
          params: [],
        },
      },
    );

    expect(mockKernel.sendVatCommand).toHaveBeenCalledWith(vatId, {
      id: 'test-id',
      jsonrpc: '2.0',
      method: 'ping',
      params: [],
    });
    expect(result).toStrictEqual({ result: 'foo' });
  });

  it('forwards errors from hooks', async () => {
    const vatId = 'vat1' as VatId;
    vi.mocked(mockKernel.sendVatCommand).mockRejectedValueOnce(
      new Error('foo'),
    );

    await expect(
      sendVatCommandHandler.implementation(
        { kernel: mockKernel },
        {
          id: vatId,
          payload: {
            id: 'test-id',
            jsonrpc: '2.0',
            method: 'ping',
            params: [],
          },
        },
      ),
    ).rejects.toThrow('foo');
  });
});
