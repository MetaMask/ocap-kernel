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
        payload: { method: 'ping', params: [] },
      },
    );

    expect(mockKernel.sendVatCommand).toHaveBeenCalledWith(vatId, {
      method: 'ping',
      params: [],
    });
    expect(result).toStrictEqual({ result: 'foo' });
  });

  it('throws if payload is not a valid kernel command', async () => {
    const vatId = 'vat1' as VatId;

    await expect(
      sendVatCommandHandler.implementation(
        { kernel: mockKernel },
        {
          id: vatId,
          payload: { notACommand: true },
        },
      ),
    ).rejects.toThrow('Invalid command payload');
    expect(mockKernel.sendVatCommand).not.toHaveBeenCalled();
  });
});
