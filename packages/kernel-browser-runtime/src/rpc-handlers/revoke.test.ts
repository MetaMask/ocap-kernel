import type { Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { revokeHandler } from './revoke.ts';

describe('revokeHandler', () => {
  let mockKernel: Kernel;
  beforeEach(() => {
    mockKernel = {
      revoke: vi.fn().mockResolvedValue(undefined),
    } as unknown as Kernel;
  });

  it('should revoke object and return null', async () => {
    const kref = 'ko1';
    const result = await revokeHandler.implementation(
      { kernel: mockKernel },
      { kref },
    );
    expect(mockKernel.revoke).toHaveBeenCalledWith(kref);
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.revoke', async () => {
    const error = new Error('Revoke failed');
    vi.mocked(mockKernel.revoke).mockImplementation(() => {
      throw error;
    });
    const kref = 'ko1';
    await expect(
      revokeHandler.implementation({ kernel: mockKernel }, { kref }),
    ).rejects.toThrow(error);
  });
});
