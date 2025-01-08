import '@ocap/shims/endoify';
import type { Kernel, KVStore } from '@ocap/kernel';
import { describe, it, expect, vi } from 'vitest';

import { clearStateHandler } from './clear-state.js';

describe('clearStateHandler', () => {
  const mockKernel = {
    reset: vi.fn().mockResolvedValue(undefined),
  } as unknown as Kernel;

  const mockKVStore = {} as unknown as KVStore;

  it('should have the correct method', () => {
    expect(clearStateHandler.method).toBe('clearState');
  });

  it('should have a schema', () => {
    expect(clearStateHandler.schema).toBeDefined();
  });

  it('should call kernel.reset() and return null', async () => {
    const result = await clearStateHandler.implementation(
      mockKernel,
      mockKVStore,
      null,
    );
    expect(mockKernel.reset).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.reset()', async () => {
    const error = new Error('Reset failed');
    vi.mocked(mockKernel.reset).mockRejectedValueOnce(error);
    await expect(
      clearStateHandler.implementation(mockKernel, mockKVStore, null),
    ).rejects.toThrow(error);
  });
});
