import type { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';
import { describe, it, expect, vi } from 'vitest';

import { terminateAllVatsHandler } from './terminate-all-vats.ts';

describe('terminateAllVatsHandler', () => {
  const mockKernel = {
    terminateAllVats: vi.fn().mockResolvedValue(undefined),
  } as unknown as Kernel;

  const mockKernelDatabase = {} as unknown as KernelDatabase;

  it('should have the correct method', () => {
    expect(terminateAllVatsHandler.method).toBe('terminateAllVats');
  });

  it('should terminate all vats and return null', async () => {
    const result = await terminateAllVatsHandler.implementation(
      mockKernel,
      mockKernelDatabase,
      null,
    );
    expect(mockKernel.terminateAllVats).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.terminateAllVats', async () => {
    const error = new Error('Termination failed');
    vi.mocked(mockKernel.terminateAllVats).mockRejectedValueOnce(error);
    await expect(
      terminateAllVatsHandler.implementation(
        mockKernel,
        mockKernelDatabase,
        null,
      ),
    ).rejects.toThrow(error);
  });
});
