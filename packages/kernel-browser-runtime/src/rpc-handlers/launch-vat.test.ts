import type { Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { launchVatHandler } from './launch-vat.ts';

describe('launchVatHandler', () => {
  let mockKernel: Kernel;

  beforeEach(() => {
    mockKernel = {
      launchVat: vi.fn().mockResolvedValue(undefined),
    } as unknown as Kernel;
  });

  it('should launch vat and return null', async () => {
    const params = { sourceSpec: 'test.js' };
    const result = await launchVatHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(mockKernel.launchVat).toHaveBeenCalledWith(params);
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.launchVat', async () => {
    const error = new Error('Launch failed');
    vi.mocked(mockKernel.launchVat).mockRejectedValueOnce(error);
    const params = { sourceSpec: 'test.js' };
    await expect(
      launchVatHandler.implementation({ kernel: mockKernel }, params),
    ).rejects.toThrow(error);
  });
});
