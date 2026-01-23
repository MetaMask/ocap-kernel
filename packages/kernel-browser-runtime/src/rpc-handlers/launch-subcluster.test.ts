import { describe, it, expect, vi } from 'vitest';

import { launchSubclusterHandler } from './launch-subcluster.ts';

describe('launchSubclusterHandler', () => {
  it('calls kernel.launchSubcluster with the provided config', async () => {
    const mockResult = {
      subclusterId: 's1',
      bootstrapRootKref: 'ko1',
      bootstrapResult: { body: '#null', slots: [] },
    };
    const mockKernel = {
      launchSubcluster: vi.fn().mockResolvedValue(mockResult),
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

  it('returns the result from kernel.launchSubcluster', async () => {
    const mockResult = {
      subclusterId: 's1',
      bootstrapRootKref: 'ko1',
      bootstrapResult: { body: '#{"result":"ok"}', slots: [] },
    };
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
    expect(result).toStrictEqual(mockResult);
  });

  it('converts undefined bootstrapResult to null for JSON compatibility', async () => {
    const mockResult = {
      subclusterId: 's1',
      bootstrapRootKref: 'ko1',
      bootstrapResult: undefined,
    };
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
    expect(result).toStrictEqual({
      subclusterId: 's1',
      bootstrapRootKref: 'ko1',
      bootstrapResult: null,
    });
  });
});
