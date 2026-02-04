import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelFacetDependencies } from './kernel-facet.ts';
import { makeKernelFacet } from './kernel-facet.ts';
import type { SlotValue } from './liveslots/kernel-marshal.ts';
import { krefOf } from './liveslots/kernel-marshal.ts';
import type { ClusterConfig, KernelStatus, Subcluster } from './types.ts';

describe('makeKernelFacet', () => {
  let deps: KernelFacetDependencies;

  beforeEach(() => {
    deps = {
      launchSubcluster: vi.fn().mockResolvedValue({
        subclusterId: 's1',
        bootstrapRootKref: 'ko1',
      }),
      terminateSubcluster: vi.fn().mockResolvedValue(undefined),
      reloadSubcluster: vi.fn().mockResolvedValue({
        id: 's2',
        config: { bootstrap: 'test', vats: {} },
        vats: {},
      }),
      getSubcluster: vi.fn().mockReturnValue({
        id: 's1',
        config: { bootstrap: 'test', vats: {} },
        vats: {},
      }),
      getSubclusters: vi
        .fn()
        .mockReturnValue([
          { id: 's1', config: { bootstrap: 'test', vats: {} }, vats: {} },
        ]),
      getStatus: vi.fn().mockResolvedValue({
        vats: [],
        subclusters: [],
        remoteComms: { isInitialized: false },
      }),
    };
  });

  it('creates a kernel facet object', () => {
    const facet = makeKernelFacet(deps);
    expect(facet).toBeDefined();
    expect(typeof facet).toBe('object');
  });

  describe('launchSubcluster', () => {
    it('calls the launchSubcluster dependency', async () => {
      const facet = makeKernelFacet(deps) as {
        launchSubcluster: (config: ClusterConfig) => Promise<unknown>;
      };
      const config: ClusterConfig = {
        bootstrap: 'myVat',
        vats: { myVat: { sourceSpec: 'test.js' } },
      };

      await facet.launchSubcluster(config);

      expect(deps.launchSubcluster).toHaveBeenCalledWith(config);
    });

    it('returns subclusterId and root as slot value', async () => {
      const facet = makeKernelFacet(deps) as {
        launchSubcluster: (
          config: ClusterConfig,
        ) => Promise<{ subclusterId: string; root: SlotValue }>;
      };
      const config: ClusterConfig = {
        bootstrap: 'myVat',
        vats: { myVat: { sourceSpec: 'test.js' } },
      };

      const result = await facet.launchSubcluster(config);

      expect(result.subclusterId).toBe('s1');
      // The root is a slot value (remotable) that carries the kref
      expect(krefOf(result.root)).toBe('ko1');
    });
  });

  describe('terminateSubcluster', () => {
    it('calls the terminateSubcluster dependency', async () => {
      const facet = makeKernelFacet(deps) as {
        terminateSubcluster: (id: string) => Promise<void>;
      };

      await facet.terminateSubcluster('s1');

      expect(deps.terminateSubcluster).toHaveBeenCalledWith('s1');
    });
  });

  describe('reloadSubcluster', () => {
    it('calls the reloadSubcluster dependency', async () => {
      const facet = makeKernelFacet(deps) as {
        reloadSubcluster: (id: string) => Promise<Subcluster>;
      };

      await facet.reloadSubcluster('s1');

      expect(deps.reloadSubcluster).toHaveBeenCalledWith('s1');
    });

    it('returns the reloaded subcluster', async () => {
      const facet = makeKernelFacet(deps) as {
        reloadSubcluster: (id: string) => Promise<Subcluster>;
      };

      const result = await facet.reloadSubcluster('s1');

      expect(result.id).toBe('s2');
    });
  });

  describe('getSubcluster', () => {
    it('calls the getSubcluster dependency', () => {
      const facet = makeKernelFacet(deps) as {
        getSubcluster: (id: string) => Subcluster | undefined;
      };

      facet.getSubcluster('s1');

      expect(deps.getSubcluster).toHaveBeenCalledWith('s1');
    });

    it('returns the subcluster', () => {
      const facet = makeKernelFacet(deps) as {
        getSubcluster: (id: string) => Subcluster | undefined;
      };

      const result = facet.getSubcluster('s1');

      expect(result?.id).toBe('s1');
    });

    it('returns undefined for unknown subcluster', () => {
      vi.spyOn(deps, 'getSubcluster').mockImplementation(() => undefined);
      const facet = makeKernelFacet(deps) as {
        getSubcluster: (id: string) => Subcluster | undefined;
      };

      const result = facet.getSubcluster('unknown');

      expect(result).toBeUndefined();
    });
  });

  describe('getSubclusters', () => {
    it('calls the getSubclusters dependency', () => {
      const facet = makeKernelFacet(deps) as {
        getSubclusters: () => Subcluster[];
      };

      facet.getSubclusters();

      expect(deps.getSubclusters).toHaveBeenCalled();
    });

    it('returns all subclusters', () => {
      const facet = makeKernelFacet(deps) as {
        getSubclusters: () => Subcluster[];
      };

      const result = facet.getSubclusters();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('s1');
    });
  });

  describe('getStatus', () => {
    it('calls the getStatus dependency', async () => {
      const facet = makeKernelFacet(deps) as {
        getStatus: () => Promise<KernelStatus>;
      };

      await facet.getStatus();

      expect(deps.getStatus).toHaveBeenCalled();
    });

    it('returns kernel status', async () => {
      const facet = makeKernelFacet(deps) as {
        getStatus: () => Promise<KernelStatus>;
      };

      const result = await facet.getStatus();

      expect(result).toStrictEqual({
        vats: [],
        subclusters: [],
        remoteComms: { isInitialized: false },
      });
    });
  });

  describe('getVatRoot', () => {
    it('returns a slot value for the given kref', () => {
      const facet = makeKernelFacet(deps) as {
        getVatRoot: (kref: string) => SlotValue;
      };

      const result = facet.getVatRoot('ko42');

      expect(krefOf(result)).toBe('ko42');
    });
  });
});
