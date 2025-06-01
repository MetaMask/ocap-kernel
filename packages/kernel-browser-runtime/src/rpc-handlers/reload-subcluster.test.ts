import { describe, it, expect, vi } from 'vitest';

import { reloadSubclusterHandler } from './reload-subcluster.ts';

describe('reloadSubclusterHandler', () => {
  it('should call kernel.reloadSubcluster with the provided id', async () => {
    const mockKernel = {
      reloadSubcluster: vi.fn().mockResolvedValue(undefined),
    };
    const params = { id: 'test-id' };
    await reloadSubclusterHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(mockKernel.reloadSubcluster).toHaveBeenCalledWith('test-id');
  });

  it('should return null when kernel.reloadSubcluster returns undefined', async () => {
    const mockKernel = {
      reloadSubcluster: vi.fn().mockResolvedValue(undefined),
    };
    const params = { id: 'test-id' };
    const result = await reloadSubclusterHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(result).toBeNull();
  });

  it('should return the result from kernel.reloadSubcluster when not undefined', async () => {
    const mockResult = { body: 'test', slots: [] };
    const mockKernel = {
      reloadSubcluster: vi.fn().mockResolvedValue(mockResult),
    };
    const params = { id: 'test-id' };
    const result = await reloadSubclusterHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(result).toBe(mockResult);
  });
});
