import type { Kernel } from '@ocap/kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { terminateVatHandler } from './terminate-vat.ts';

describe('terminateVatHandler', () => {
  let mockKernel: Kernel;
  beforeEach(() => {
    mockKernel = {
      terminateVat: vi.fn().mockResolvedValue(undefined),
    } as unknown as Kernel;
  });

  it('should terminate vat and return null', async () => {
    const params = { id: 'v0' } as const;
    const result = await terminateVatHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(mockKernel.terminateVat).toHaveBeenCalledWith(params.id);
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.terminateVat', async () => {
    const error = new Error('Termination failed');
    vi.mocked(mockKernel.terminateVat).mockRejectedValueOnce(error);
    const params = { id: 'v0' } as const;
    await expect(
      terminateVatHandler.implementation({ kernel: mockKernel }, params),
    ).rejects.toThrow(error);
  });
});
