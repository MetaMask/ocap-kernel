import type { Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { isRevokedHandler } from './is-revoked.ts';

describe('isRevokedHandler', () => {
  let mockKernel: Kernel;
  beforeEach(() => {
    mockKernel = {
      isRevoked: vi.fn(),
    } as unknown as Kernel;
  });

  it.each`
    isRevoked
    ${false}
    ${true}
  `('should return the result of kernel.isRevoked', async ({ isRevoked }) => {
    const kref = 'ko1';
    vi.mocked(mockKernel.isRevoked).mockReturnValue(isRevoked);
    const result = isRevokedHandler.implementation(
      { kernel: mockKernel },
      { kref },
    );
    expect(mockKernel.isRevoked).toHaveBeenCalledWith(kref);
    expect(result).toStrictEqual([isRevoked]);
  });

  it('should propagate errors from kernel.isRevoked', () => {
    const error = new Error('IsRevoked failed');
    vi.mocked(mockKernel.isRevoked).mockImplementation(() => {
      throw error;
    });
    const kref = 'ko1';
    expect(() =>
      isRevokedHandler.implementation({ kernel: mockKernel }, { kref }),
    ).toThrow(error);
  });
});
