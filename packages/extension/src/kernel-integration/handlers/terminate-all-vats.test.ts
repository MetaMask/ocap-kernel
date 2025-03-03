import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';
import { describe, it, expect, vi } from 'vitest';

import { terminateAllVatsHandler } from './terminate-all-vats.ts';

describe('terminateAllVatsHandler', () => {
  const mockKernel = {
    terminateAllVats: vi.fn().mockResolvedValue(undefined),
  } as unknown as Kernel;

  const mockKVStore = {} as unknown as KVStore;

  it('should have the correct method', () => {
    expect(terminateAllVatsHandler.method).toBe('terminateAllVats');
  });

  it('should terminate all vats and return null', async () => {
    const result = await terminateAllVatsHandler.implementation(
      mockKernel,
      mockKVStore,
      null,
    );
    expect(mockKernel.terminateAllVats).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.terminateAllVats', async () => {
    const error = new Error('Termination failed');
    vi.mocked(mockKernel.terminateAllVats).mockRejectedValueOnce(error);
    await expect(
      terminateAllVatsHandler.implementation(mockKernel, mockKVStore, null),
    ).rejects.toThrow(error);
  });
});
