import type { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';
import { describe, it, expect, vi } from 'vitest';

import { clearStateHandler } from './clear-state.ts';

describe('clearStateHandler', () => {
  const mockKernel = {
    reset: vi.fn().mockResolvedValue(undefined),
  } as unknown as Kernel;

  const mockKernelDatabase = {} as unknown as KernelDatabase;

  it('should have the correct method', () => {
    expect(clearStateHandler.method).toBe('clearState');
  });

  it('should have a schema', () => {
    expect(clearStateHandler.schema).toBeDefined();
  });

  it('should call kernel.reset() and return null', async () => {
    const result = await clearStateHandler.implementation(
      mockKernel,
      mockKernelDatabase,
      null,
    );
    expect(mockKernel.reset).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.reset()', async () => {
    const error = new Error('Reset failed');
    vi.mocked(mockKernel.reset).mockRejectedValueOnce(error);
    await expect(
      clearStateHandler.implementation(mockKernel, mockKernelDatabase, null),
    ).rejects.toThrow(error);
  });
});
