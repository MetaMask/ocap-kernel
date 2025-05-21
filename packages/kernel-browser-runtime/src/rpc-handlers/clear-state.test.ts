import type { Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { clearStateHandler } from './clear-state.ts';

describe('clearStateHandler', () => {
  let mockKernel: Kernel;

  beforeEach(() => {
    mockKernel = {
      reset: vi.fn(),
    } as unknown as Kernel;
  });

  it('clears state', async () => {
    const result = await clearStateHandler.implementation(
      { kernel: mockKernel },
      [],
    );

    expect(mockKernel.reset).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('should propagate errors from clearState', async () => {
    const error = new Error('Clear state failed');
    vi.mocked(mockKernel.reset).mockImplementationOnce(() => {
      throw error;
    });
    await expect(
      clearStateHandler.implementation({ kernel: mockKernel }, []),
    ).rejects.toThrow(error);
  });
});
