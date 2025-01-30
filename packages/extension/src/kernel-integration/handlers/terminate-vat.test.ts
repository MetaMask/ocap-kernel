import type { Kernel, KVStore } from '@ocap/kernel';
import { describe, it, expect, vi } from 'vitest';

import { terminateVatHandler } from './terminate-vat.js';

describe('terminateVatHandler', () => {
  const mockKernel = {
    terminateVat: vi.fn().mockResolvedValue(undefined),
  } as unknown as Kernel;

  const mockKVStore = {} as unknown as KVStore;

  it('should have the correct method', () => {
    expect(terminateVatHandler.method).toBe('terminateVat');
  });

  it('should terminate vat and return null', async () => {
    const params = { id: 'v0' } as const;
    const result = await terminateVatHandler.implementation(
      mockKernel,
      mockKVStore,
      params,
    );
    expect(mockKernel.terminateVat).toHaveBeenCalledWith(params.id);
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.terminateVat', async () => {
    const error = new Error('Termination failed');
    vi.mocked(mockKernel.terminateVat).mockRejectedValueOnce(error);
    const params = { id: 'v0' } as const;
    await expect(
      terminateVatHandler.implementation(mockKernel, mockKVStore, params),
    ).rejects.toThrow(error);
  });
});
