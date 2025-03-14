import type { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { reloadConfigHandler } from './reload-config.ts';

describe('reloadConfigHandler', () => {
  const mockKernel = {
    reload: vi.fn().mockResolvedValue(undefined),
  } as Partial<Kernel>;

  const mockKernelDatabase = {} as KernelDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call kernel.reload() and return null', async () => {
    const result = await reloadConfigHandler.implementation(
      mockKernel as Kernel,
      mockKernelDatabase,
      [],
    );

    expect(mockKernel.reload).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('should use the correct method name', () => {
    expect(reloadConfigHandler.method).toBe('reload');
  });

  it('should use the clearState schema for params', () => {
    expect(reloadConfigHandler.schema).toBeDefined();
  });

  it('should propagate errors from kernel.reload()', async () => {
    const error = new Error('Reload failed');
    vi.mocked(mockKernel.reload)?.mockRejectedValueOnce(error);

    await expect(
      reloadConfigHandler.implementation(
        mockKernel as Kernel,
        mockKernelDatabase,
        [],
      ),
    ).rejects.toThrow(error);
  });
});
