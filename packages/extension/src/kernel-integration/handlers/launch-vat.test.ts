import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';
import { describe, it, expect, vi } from 'vitest';

import { launchVatHandler } from './launch-vat.js';

describe('launchVatHandler', () => {
  const mockKernel = {
    launchVat: vi.fn().mockResolvedValue(undefined),
  } as unknown as Kernel;

  const mockKVStore = {} as unknown as KVStore;

  it('should have the correct method', () => {
    expect(launchVatHandler.method).toBe('launchVat');
  });

  it('should have a schema', () => {
    expect(launchVatHandler.schema).toBeDefined();
  });

  it('should launch vat and return null', async () => {
    const params = { sourceSpec: 'test.js' };
    const result = await launchVatHandler.implementation(
      mockKernel,
      mockKVStore,
      params,
    );
    expect(mockKernel.launchVat).toHaveBeenCalledWith(params);
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.launchVat', async () => {
    const error = new Error('Launch failed');
    vi.mocked(mockKernel.launchVat).mockRejectedValueOnce(error);
    const params = { sourceSpec: 'test.js' };
    await expect(
      launchVatHandler.implementation(mockKernel, mockKVStore, params),
    ).rejects.toThrow(error);
  });
});
