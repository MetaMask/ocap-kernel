import type { Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { evaluateVatHandler } from './evaluate-vat.ts';

describe('evaluateVatHandler', () => {
  let mockKernel: Kernel;

  beforeEach(() => {
    mockKernel = {
      evaluateVat: vi.fn().mockResolvedValue({ success: true, value: 2 }),
    } as unknown as Kernel;
  });

  it('evaluates code in a vat and returns result', async () => {
    const params = { id: 'v0', code: '1 + 1' } as const;
    const result = await evaluateVatHandler.implementation(
      { kernel: mockKernel },
      params,
    );

    expect(mockKernel.evaluateVat).toHaveBeenCalledWith(params.id, params.code);
    expect(result).toStrictEqual({ success: true, value: 2 });
  });

  it('propagates errors from kernel.evaluateVat', async () => {
    const error = new Error('Evaluate failed');
    vi.mocked(mockKernel.evaluateVat).mockRejectedValueOnce(error);

    const params = { id: 'v0', code: 'bad code' } as const;
    await expect(
      evaluateVatHandler.implementation({ kernel: mockKernel }, params),
    ).rejects.toThrow(error);
  });
});
