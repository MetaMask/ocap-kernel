import type { Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { restartVatHandler } from './restart-vat.ts';

describe('restartVatHandler', () => {
  let mockKernel: Kernel;
  beforeEach(() => {
    mockKernel = {
      restartVat: vi.fn().mockResolvedValue(undefined),
    } as unknown as Kernel;
  });

  it('should restart vat and return null', async () => {
    const params = { id: 'v0' } as const;
    const result = await restartVatHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(mockKernel.restartVat).toHaveBeenCalledWith(params.id);
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.restartVat', async () => {
    const error = new Error('Restart failed');
    vi.mocked(mockKernel.restartVat).mockRejectedValueOnce(error);
    const params = { id: 'v0' } as const;
    await expect(
      restartVatHandler.implementation({ kernel: mockKernel }, params),
    ).rejects.toThrow(error);
  });
});
