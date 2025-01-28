import '@ocap/test-utils/mock-endoify';
import type { Kernel, KVStore } from '@ocap/kernel';
import { describe, it, expect, vi } from 'vitest';

import { restartVatHandler } from './restart-vat.js';

describe('restartVatHandler', () => {
  const mockKernel = {
    restartVat: vi.fn().mockResolvedValue(undefined),
  } as unknown as Kernel;

  const mockKVStore = {} as unknown as KVStore;

  it('should have the correct method', () => {
    expect(restartVatHandler.method).toBe('restartVat');
  });

  it('should have a schema', () => {
    expect(restartVatHandler.schema).toBeDefined();
  });

  it('should restart vat and return null', async () => {
    const params = { id: 'v0' } as const;
    const result = await restartVatHandler.implementation(
      mockKernel,
      mockKVStore,
      params,
    );
    expect(mockKernel.restartVat).toHaveBeenCalledWith(params.id);
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.restartVat', async () => {
    const error = new Error('Restart failed');
    vi.mocked(mockKernel.restartVat).mockRejectedValueOnce(error);
    const params = { id: 'v0' } as const;
    await expect(
      restartVatHandler.implementation(mockKernel, mockKVStore, params),
    ).rejects.toThrow(error);
  });
});
