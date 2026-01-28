import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

import type { KernelFacetDependencies } from '../kernel-facet.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type {
  SystemSubclusterConfig,
  SystemVatBuildRootObject,
  SystemVatId,
} from '../types.ts';
import { SystemSubclusterManager } from './SystemSubclusterManager.ts';

// Mock liveslots
const mockDispatch = vi.fn();
vi.mock('@agoric/swingset-liveslots', () => ({
  makeLiveSlots: vi.fn(() => ({
    dispatch: mockDispatch,
  })),
}));

describe('SystemSubclusterManager', () => {
  let kernelStore: KernelStore;
  let kernelQueue: KernelQueue;
  let kernelFacetDeps: KernelFacetDependencies;
  let logger: Logger;
  let manager: SystemSubclusterManager;

  const buildRootObject: SystemVatBuildRootObject = vi.fn(() => ({
    bootstrap: vi.fn(),
    test: () => 'test',
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockResolvedValue(undefined);

    kernelStore = {
      initEndpoint: vi.fn(),
      erefToKref: vi.fn().mockReturnValue(null),
      initKernelObject: vi.fn().mockReturnValue('ko1'),
      addCListEntry: vi.fn(),
      translateSyscallVtoK: vi.fn((_, vso) => vso),
      getKernelPromise: vi.fn(() => ({ state: 'unresolved' })),
      addPromiseSubscriber: vi.fn(),
      clearReachableFlag: vi.fn(),
      getReachableFlag: vi.fn(),
      forgetKref: vi.fn(),
      getPromisesByDecider: vi.fn(() => []),
      deleteEndpoint: vi.fn(),
      kv: {
        get: vi.fn().mockReturnValue(undefined),
      },
    } as unknown as KernelStore;

    kernelQueue = {
      waitForCrank: vi.fn().mockResolvedValue(undefined),
      enqueueSend: vi.fn(),
      resolvePromises: vi.fn(),
      enqueueNotify: vi.fn(),
      enqueueMessage: vi.fn(),
    } as unknown as KernelQueue;

    kernelFacetDeps = {
      launchSubcluster: vi.fn().mockResolvedValue({
        subclusterId: 's1',
        bootstrapRootKref: 'ko2',
      }),
      terminateSubcluster: vi.fn().mockResolvedValue(undefined),
      reloadSubcluster: vi.fn().mockResolvedValue({ id: 's2' }),
      getSubcluster: vi.fn().mockReturnValue(undefined),
      getSubclusters: vi.fn().mockReturnValue([]),
      getStatus: vi.fn().mockResolvedValue({ initialized: true }),
    };

    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      subLogger: vi.fn(() => logger),
    } as unknown as Logger;

    manager = new SystemSubclusterManager({
      kernelStore,
      kernelQueue,
      kernelFacetDeps,
      logger,
    });
  });

  describe('launchSystemSubcluster', () => {
    const config: SystemSubclusterConfig = {
      bootstrap: 'testVat',
      vats: {
        testVat: { buildRootObject },
      },
    };

    it('waits for crank before launching', async () => {
      await manager.launchSystemSubcluster(config);

      expect(kernelQueue.waitForCrank).toHaveBeenCalled();
    });

    it('throws if bootstrap vat is not in vats config', async () => {
      const badConfig: SystemSubclusterConfig = {
        bootstrap: 'missing',
        vats: {
          testVat: { buildRootObject },
        },
      };

      await expect(manager.launchSystemSubcluster(badConfig)).rejects.toThrow(
        'invalid bootstrap vat name missing',
      );
    });

    it('allocates system vat IDs starting from sv0', async () => {
      const result = await manager.launchSystemSubcluster(config);

      expect(result.vatIds.testVat).toBe('sv0');
    });

    it('allocates incrementing system vat IDs', async () => {
      const result1 = await manager.launchSystemSubcluster(config);
      const result2 = await manager.launchSystemSubcluster(config);

      expect(result1.vatIds.testVat).toBe('sv0');
      expect(result2.vatIds.testVat).toBe('sv1');
    });

    it('allocates system subcluster IDs starting from ss0', async () => {
      const result = await manager.launchSystemSubcluster(config);

      expect(result.systemSubclusterId).toBe('ss0');
    });

    it('initializes endpoints for each vat', async () => {
      await manager.launchSystemSubcluster(config);

      expect(kernelStore.initEndpoint).toHaveBeenCalledWith('sv0');
    });

    it('initializes kernel objects for vat roots', async () => {
      await manager.launchSystemSubcluster(config);

      expect(kernelStore.initKernelObject).toHaveBeenCalledWith('sv0');
    });

    it('adds clist entries for root objects', async () => {
      await manager.launchSystemSubcluster(config);

      expect(kernelStore.addCListEntry).toHaveBeenCalledWith(
        'sv0',
        'ko1',
        'o+0',
      );
    });

    it('enqueues bootstrap message to root object', async () => {
      await manager.launchSystemSubcluster(config);

      expect(kernelQueue.enqueueMessage).toHaveBeenCalledWith(
        'ko1',
        'bootstrap',
        expect.any(Array),
      );
    });

    it('launches multiple vats in a subcluster', async () => {
      const multiVatConfig: SystemSubclusterConfig = {
        bootstrap: 'bootstrap',
        vats: {
          bootstrap: { buildRootObject },
          worker: { buildRootObject },
        },
      };

      const result = await manager.launchSystemSubcluster(multiVatConfig);

      expect(result.vatIds.bootstrap).toBe('sv0');
      expect(result.vatIds.worker).toBe('sv1');
      expect(kernelStore.initEndpoint).toHaveBeenCalledTimes(2);
    });

    it('uses existing root kref if available', async () => {
      (kernelStore.erefToKref as unknown as MockInstance).mockReturnValueOnce(
        'ko-existing',
      );

      await manager.launchSystemSubcluster(config);

      expect(kernelStore.initKernelObject).not.toHaveBeenCalled();
      expect(kernelQueue.enqueueMessage).toHaveBeenCalledWith(
        'ko-existing',
        'bootstrap',
        expect.any(Array),
      );
    });

    it('warns if requested service is not found', async () => {
      const configWithServices: SystemSubclusterConfig = {
        bootstrap: 'testVat',
        vats: { testVat: { buildRootObject } },
        services: ['unknownService'],
      };

      await manager.launchSystemSubcluster(configWithServices);

      expect(logger.warn).toHaveBeenCalledWith(
        "Kernel service 'unknownService' not found",
      );
    });

    it('includes services in bootstrap message when available', async () => {
      (kernelStore.kv.get as unknown as MockInstance).mockReturnValueOnce(
        'ko-service',
      );

      const configWithServices: SystemSubclusterConfig = {
        bootstrap: 'testVat',
        vats: { testVat: { buildRootObject } },
        services: ['myService'],
      };

      await manager.launchSystemSubcluster(configWithServices);

      expect(kernelQueue.enqueueMessage).toHaveBeenCalledWith(
        'ko1',
        'bootstrap',
        [
          expect.anything(),
          expect.objectContaining({ myService: expect.anything() }),
        ],
      );
    });
  });

  describe('terminateSystemSubcluster', () => {
    it('waits for crank before terminating', async () => {
      const config: SystemSubclusterConfig = {
        bootstrap: 'testVat',
        vats: { testVat: { buildRootObject } },
      };
      const result = await manager.launchSystemSubcluster(config);

      await manager.terminateSystemSubcluster(result.systemSubclusterId);

      expect(kernelQueue.waitForCrank).toHaveBeenCalled();
    });

    it('throws if subcluster is not found', async () => {
      await expect(
        manager.terminateSystemSubcluster('ss-nonexistent'),
      ).rejects.toThrow('System subcluster ss-nonexistent not found');
    });

    it('removes subcluster from active subclusters', async () => {
      const config: SystemSubclusterConfig = {
        bootstrap: 'testVat',
        vats: { testVat: { buildRootObject } },
      };
      const result = await manager.launchSystemSubcluster(config);

      expect(manager.isSystemVatActive('sv0' as SystemVatId)).toBe(true);

      await manager.terminateSystemSubcluster(result.systemSubclusterId);

      expect(manager.isSystemVatActive('sv0' as SystemVatId)).toBe(false);
    });
  });

  describe('getSystemVatHandle', () => {
    it('returns handle for active system vat', async () => {
      const config: SystemSubclusterConfig = {
        bootstrap: 'testVat',
        vats: { testVat: { buildRootObject } },
      };
      await manager.launchSystemSubcluster(config);

      const handle = manager.getSystemVatHandle('sv0' as SystemVatId);

      expect(handle).toBeDefined();
      expect(handle?.systemVatId).toBe('sv0');
    });

    it('returns undefined for unknown system vat', () => {
      const handle = manager.getSystemVatHandle('sv-unknown' as SystemVatId);

      expect(handle).toBeUndefined();
    });
  });

  describe('getSystemVatIds', () => {
    it('returns empty array when no subclusters exist', () => {
      const ids = manager.getSystemVatIds();

      expect(ids).toStrictEqual([]);
    });

    it('returns all system vat IDs', async () => {
      const config: SystemSubclusterConfig = {
        bootstrap: 'v1',
        vats: {
          v1: { buildRootObject },
          v2: { buildRootObject },
        },
      };
      await manager.launchSystemSubcluster(config);

      const ids = manager.getSystemVatIds();

      expect(ids).toContain('sv0');
      expect(ids).toContain('sv1');
      expect(ids).toHaveLength(2);
    });
  });

  describe('isSystemVatActive', () => {
    it('returns false for unknown system vat', () => {
      const isActive = manager.isSystemVatActive('sv-unknown' as SystemVatId);

      expect(isActive).toBe(false);
    });

    it('returns true for active system vat', async () => {
      const config: SystemSubclusterConfig = {
        bootstrap: 'testVat',
        vats: { testVat: { buildRootObject } },
      };
      await manager.launchSystemSubcluster(config);

      const isActive = manager.isSystemVatActive('sv0' as SystemVatId);

      expect(isActive).toBe(true);
    });
  });
});
