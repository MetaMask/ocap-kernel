import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelFacetDependencies } from './kernel-facet.ts';
import { makeKernelFacet } from './kernel-facet.ts';
import type { SlotValue } from './liveslots/kernel-marshal.ts';
import { krefOf, kslot } from './liveslots/kernel-marshal.ts';
import type { ClusterConfig, KernelStatus, Subcluster } from './types.ts';

describe('makeKernelFacet', () => {
  let deps: KernelFacetDependencies;

  beforeEach(() => {
    deps = {
      getPresence: vi
        .fn()
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        .mockImplementation((kref: string, iface: string) =>
          kslot(kref, iface),
        ),
      getStatus: vi.fn().mockResolvedValue({
        vats: [],
        subclusters: [],
        remoteComms: { isInitialized: false },
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
      getSystemSubclusterRoot: vi.fn().mockReturnValue('ko99'),
      launchSubcluster: vi.fn().mockResolvedValue({
        subclusterId: 's1',
        rootKref: 'ko1',
      }),
      pingVat: vi.fn().mockResolvedValue({ alive: true }),
      queueMessage: vi.fn().mockResolvedValue({
        body: '#{"result":"ok"}',
        slots: [],
      }),
      reloadSubcluster: vi.fn().mockResolvedValue({
        id: 's2',
        config: { bootstrap: 'test', vats: {} },
        vats: {},
      }),
      reset: vi.fn().mockResolvedValue(undefined),
      terminateSubcluster: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('creates a kernel facet object', () => {
    const facet = makeKernelFacet(deps);
    expect(facet).toBeDefined();
    expect(typeof facet).toBe('object');
  });

  describe('launchSubcluster', () => {
    it('delegates to the launchSubcluster dependency', async () => {
      const facet = makeKernelFacet(deps) as {
        launchSubcluster: (config: ClusterConfig) => Promise<unknown>;
      };
      const config: ClusterConfig = {
        bootstrap: 'myVat',
        vats: { myVat: { sourceSpec: 'test.js' } },
      };

      const result = await facet.launchSubcluster(config);

      expect(deps.launchSubcluster).toHaveBeenCalledWith(config);
      expect(result).toStrictEqual({
        subclusterId: 's1',
        rootKref: 'ko1',
      });
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

  describe('getPresence', () => {
    it('delegates to the getPresence dependency', () => {
      const facet = makeKernelFacet(deps) as {
        getPresence: (kref: string, iface?: string) => SlotValue;
      };

      const result = facet.getPresence('ko42', 'vatRoot');

      expect(deps.getPresence).toHaveBeenCalledWith('ko42', 'vatRoot');
      expect(krefOf(result)).toBe('ko42');
    });
  });

  describe('ping', () => {
    it('returns "pong"', () => {
      const facet = makeKernelFacet(deps) as {
        ping: () => 'pong';
      };

      expect(facet.ping()).toBe('pong');
    });
  });

  describe('pingVat', () => {
    it('delegates to the pingVat dependency', async () => {
      const facet = makeKernelFacet(deps) as {
        pingVat: (vatId: string) => Promise<unknown>;
      };

      const result = await facet.pingVat('v1');

      expect(result).toStrictEqual({ alive: true });
      expect(deps.pingVat).toHaveBeenCalledWith('v1');
    });
  });

  describe('getSystemSubclusterRoot', () => {
    it('returns the kref for a known system subcluster', () => {
      const facet = makeKernelFacet(deps) as {
        getSystemSubclusterRoot: (name: string) => string;
      };

      const result = facet.getSystemSubclusterRoot('my-system');

      expect(result).toBe('ko99');
      expect(deps.getSystemSubclusterRoot).toHaveBeenCalledWith('my-system');
    });

    it('propagates errors from the dependency', () => {
      vi.mocked(deps.getSystemSubclusterRoot).mockImplementation(() => {
        throw new Error('System subcluster "unknown" not found');
      });
      const facet = makeKernelFacet(deps) as {
        getSystemSubclusterRoot: (name: string) => string;
      };

      expect(() => facet.getSystemSubclusterRoot('unknown')).toThrow(
        'System subcluster "unknown" not found',
      );
    });
  });

  describe('reset', () => {
    it('delegates to the reset dependency', async () => {
      const facet = makeKernelFacet(deps) as {
        reset: () => Promise<void>;
      };

      await facet.reset();

      expect(deps.reset).toHaveBeenCalled();
    });
  });

  describe('queueMessage', () => {
    it('delegates to the queueMessage dependency', async () => {
      const facet = makeKernelFacet(deps) as {
        queueMessage: (
          target: string,
          method: string,
          args: unknown[],
        ) => Promise<unknown>;
      };

      const result = await facet.queueMessage('ko1', 'doThing', ['arg1']);

      expect(result).toStrictEqual({
        body: '#{"result":"ok"}',
        slots: [],
      });
      expect(deps.queueMessage).toHaveBeenCalledWith('ko1', 'doThing', [
        'arg1',
      ]);
    });
  });
});
