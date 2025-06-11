import { describe, it, expect, vi } from 'vitest';

import { terminateSubclusterHandler } from './terminate-subcluster.ts';

describe('terminateSubclusterHandler', () => {
  it('should call kernel.terminateSubcluster with the provided id', async () => {
    const mockKernel = {
      terminateSubcluster: vi.fn().mockResolvedValue(undefined),
    };
    const params = { id: 'test-id' };
    await terminateSubclusterHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(mockKernel.terminateSubcluster).toHaveBeenCalledWith('test-id');
  });

  it('should return null after successful termination', async () => {
    const mockKernel = {
      terminateSubcluster: vi.fn().mockResolvedValue(undefined),
    };
    const params = { id: 'test-id' };
    const result = await terminateSubclusterHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(result).toBeNull();
  });
});
