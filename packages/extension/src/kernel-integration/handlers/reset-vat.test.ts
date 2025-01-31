import '@ocap/test-utils/mock-endoify';
import type { Kernel, KVStore } from '@ocap/kernel';
import { describe, it, expect, vi } from 'vitest';

import { resetVatHandler } from './reset-vat.js';

describe('resetVatStorageHandler', () => {
  const mockKernel = {
    resetVatStorage: vi.fn().mockResolvedValue(undefined),
  } as unknown as Kernel;

  const mockKVStore = {} as unknown as KVStore;

  it('should have the correct method', () => {
    expect(resetVatHandler.method).toBe('resetVat');
  });

  it('should terminate vat and return null', async () => {
    const params = { id: 'v0' } as const;
    const result = await resetVatHandler.implementation(
      mockKernel,
      mockKVStore,
      params,
    );
    expect(mockKernel.resetVat).toHaveBeenCalledWith(params.id);
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.resetVat', async () => {
    const error = new Error('Reset failed');
    vi.mocked(mockKernel.resetVat).mockRejectedValueOnce(error);
    const params = { id: 'v0' } as const;
    await expect(
      resetVatHandler.implementation(mockKernel, mockKVStore, params),
    ).rejects.toThrow(error);
  });
});
