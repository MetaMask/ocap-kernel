import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelHostRoot } from './index.ts';
import { makeKernelHostSubclusterConfig, makeHostSubcluster } from './index.ts';

describe('makeKernelHostSubclusterConfig', () => {
  const mockKernelFacet = {
    launchSubcluster: vi.fn(),
    terminateSubcluster: vi.fn(),
    getStatus: vi.fn(),
    reloadSubcluster: vi.fn(),
    getSubcluster: vi.fn(),
    getSubclusters: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid system subcluster config', () => {
    const onRootCreated = vi.fn();
    const config = makeKernelHostSubclusterConfig(onRootCreated);

    expect(config.bootstrap).toBe('kernelHost');
    expect(config.vats.kernelHost).toBeDefined();
    expect(config.vats?.kernelHost?.buildRootObject).toBeTypeOf('function');
  });

  it('invokes onRootCreated callback when buildRootObject is called', () => {
    const onRootCreated = vi.fn();
    const config = makeKernelHostSubclusterConfig(onRootCreated);

    const root = config.vats?.kernelHost?.buildRootObject(
      {
        kernelFacet: mockKernelFacet,
      },
      {},
    );

    expect(onRootCreated).toHaveBeenCalledWith(root);
  });

  describe('kernel host root', () => {
    let root: KernelHostRoot;

    beforeEach(() => {
      const onRootCreated = vi.fn();
      const config = makeKernelHostSubclusterConfig(onRootCreated);
      root = config.vats?.kernelHost?.buildRootObject(
        {
          kernelFacet: mockKernelFacet,
        },
        {},
      ) as KernelHostRoot;
    });

    it('creates root with expected methods', () => {
      expect(root.ping).toBeTypeOf('function');
      expect(root.launchSubcluster).toBeTypeOf('function');
      expect(root.terminateSubcluster).toBeTypeOf('function');
      expect(root.getStatus).toBeTypeOf('function');
      expect(root.reloadSubcluster).toBeTypeOf('function');
      expect(root.getSubcluster).toBeTypeOf('function');
      expect(root.getSubclusters).toBeTypeOf('function');
    });

    it('ping returns pong', async () => {
      const result = await root.ping();
      expect(result).toBe('pong');
    });

    // Note: launchSubcluster, terminateSubcluster, getStatus, reloadSubcluster
    // use E() which requires endo initialization. These are integration tested
    // via the full system tests rather than unit tests.

    it('getSubcluster calls kernel facet synchronously', () => {
      mockKernelFacet.getSubcluster.mockReturnValue({
        id: 's1',
        config: { bootstrap: 'test', vats: {} },
        vats: {},
      });

      const result = root.getSubcluster('s1');

      expect(mockKernelFacet.getSubcluster).toHaveBeenCalledWith('s1');
      expect(result?.id).toBe('s1');
    });

    it('getSubclusters calls kernel facet synchronously', () => {
      mockKernelFacet.getSubclusters.mockReturnValue([
        { id: 's1', config: { bootstrap: 'test', vats: {} }, vats: {} },
      ]);

      const result = root.getSubclusters();

      expect(mockKernelFacet.getSubclusters).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });
});

describe('makeHostSubcluster', () => {
  it('launches system subcluster and returns result', async () => {
    const mockKernel = {
      launchSystemSubcluster: vi.fn(async (config) => {
        // Simulate the kernel calling buildRootObject
        const mockKernelFacet = {
          launchSubcluster: vi.fn(),
          terminateSubcluster: vi.fn(),
          getStatus: vi.fn(),
          reloadSubcluster: vi.fn(),
          getSubcluster: vi.fn(),
          getSubclusters: vi.fn(),
        };
        config.vats?.kernelHost?.buildRootObject(
          { kernelFacet: mockKernelFacet },
          {},
        );
        return { systemSubclusterId: 'ss0', vatIds: { kernelHost: 'sv0' } };
      }),
    };

    const result = await makeHostSubcluster(mockKernel as never);

    expect(mockKernel.launchSystemSubcluster).toHaveBeenCalledWith(
      expect.objectContaining({
        bootstrap: 'kernelHost',
        vats: expect.objectContaining({
          kernelHost: expect.objectContaining({
            buildRootObject: expect.any(Function),
          }),
        }),
      }),
    );
    expect(result.systemSubclusterId).toBe('ss0');
    expect(result.kernelHostRoot).toBeDefined();
    expect(result.kernelHostRoot.ping).toBeTypeOf('function');
  });

  it('throws if root object not captured', async () => {
    const mockKernel = {
      launchSystemSubcluster: vi.fn(async () => ({
        systemSubclusterId: 'ss0',
        vatIds: { kernelHost: 'sv0' },
      })),
    };

    await expect(makeHostSubcluster(mockKernel as never)).rejects.toThrow(
      'Failed to capture kernel host root object',
    );
  });
});
