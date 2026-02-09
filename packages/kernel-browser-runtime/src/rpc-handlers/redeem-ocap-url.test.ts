import type { Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { redeemOcapURLHandler } from './redeem-ocap-url.ts';

describe('redeemOcapURLHandler', () => {
  let mockKernel: Kernel;
  beforeEach(() => {
    mockKernel = {
      redeemOcapURL: vi.fn().mockResolvedValue('ko42'),
    } as unknown as Kernel;
  });

  it('returns the redeemed kref', async () => {
    const url = 'ocap://peer123/ko1';
    const result = await redeemOcapURLHandler.implementation(
      { kernel: mockKernel },
      { url },
    );
    expect(mockKernel.redeemOcapURL).toHaveBeenCalledWith(url);
    expect(result).toBe('ko42');
  });

  it('propagates errors from kernel.redeemOcapURL', async () => {
    const error = new Error('Invalid OCAP URL');
    vi.mocked(mockKernel.redeemOcapURL).mockRejectedValue(error);
    await expect(
      redeemOcapURLHandler.implementation(
        { kernel: mockKernel },
        { url: 'ocap://bad' },
      ),
    ).rejects.toThrow(error);
  });
});
