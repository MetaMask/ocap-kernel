import { describe, it, expect, vi } from 'vitest';

import { launchSubclusterHandler } from './launch-subcluster.ts';

describe('launchSubclusterHandler', () => {
  it('should call kernel.launchSubcluster with the provided config', async () => {
    const mockKernel = {
      launchSubcluster: vi.fn().mockResolvedValue(undefined),
    };
    const params = {
      config: {
        bootstrap: 'test-bootstrap',
        vats: {},
      },
    };
    await launchSubclusterHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(mockKernel.launchSubcluster).toHaveBeenCalledWith(params.config);
  });

  it('should return null when kernel.launchSubcluster returns undefined', async () => {
    const mockKernel = {
      launchSubcluster: vi.fn().mockResolvedValue(undefined),
    };
    const params = {
      config: {
        bootstrap: 'test-bootstrap',
        vats: {},
      },
    };
    const result = await launchSubclusterHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(result).toBeNull();
  });

  it('should return the result from kernel.launchSubcluster when not undefined', async () => {
    const mockResult = { body: 'test', slots: [] };
    const mockKernel = {
      launchSubcluster: vi.fn().mockResolvedValue(mockResult),
    };
    const params = {
      config: {
        bootstrap: 'test-bootstrap',
        vats: {},
      },
    };
    const result = await launchSubclusterHandler.implementation(
      { kernel: mockKernel },
      params,
    );
    expect(result).toBe(mockResult);
  });
});
