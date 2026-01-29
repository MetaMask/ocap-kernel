import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

import type { KernelFacetDependencies } from '../kernel-facet.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type {
  KernelSystemSubclusterConfig,
  SystemVatId,
  SystemVatTransport,
} from '../types.ts';
import { SystemSubclusterManager } from './SystemSubclusterManager.ts';

describe('SystemSubclusterManager', () => {
  let kernelStore: KernelStore;
  let kernelQueue: KernelQueue;
  let kernelFacetDeps: KernelFacetDependencies;
  let logger: Logger;
  let manager: SystemSubclusterManager;

  /**
   * Creates a mock transport for testing.
   *
   * @returns A mock transport with vi.fn() implementations.
   */
  function makeMockTransport(): SystemVatTransport {
    return {
      deliver: vi.fn().mockResolvedValue(null),
      setSyscallHandler: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

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
      registerKernelService: vi
        .fn()
        .mockReturnValue({ kref: 'ko-kernelFacet' }),
      logger,
    });
  });

  describe('connectSystemSubcluster', () => {
    it('throws if bootstrap vat is not in vatTransports', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'missing',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      await expect(manager.connectSystemSubcluster(config)).rejects.toThrow(
        'invalid bootstrap vat name missing',
      );
    });

    it('allocates system vat IDs starting from sv0', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      const result = await manager.connectSystemSubcluster(config);

      expect(result.vatIds.testVat).toBe('sv0');
    });

    it('allocates incrementing system vat IDs', async () => {
      const config1: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };
      const config2: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      const result1 = await manager.connectSystemSubcluster(config1);
      const result2 = await manager.connectSystemSubcluster(config2);

      expect(result1.vatIds.testVat).toBe('sv0');
      expect(result2.vatIds.testVat).toBe('sv1');
    });

    it('allocates system subcluster IDs starting from ss0', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      const result = await manager.connectSystemSubcluster(config);

      expect(result.systemSubclusterId).toBe('ss0');
    });

    it('initializes endpoints for each vat', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      await manager.connectSystemSubcluster(config);

      expect(kernelStore.initEndpoint).toHaveBeenCalledWith('sv0');
    });

    it('initializes kernel objects for vat roots', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      await manager.connectSystemSubcluster(config);

      expect(kernelStore.initKernelObject).toHaveBeenCalledWith('sv0');
    });

    it('adds clist entries for root objects', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      await manager.connectSystemSubcluster(config);

      expect(kernelStore.addCListEntry).toHaveBeenCalledWith(
        'sv0',
        'ko1',
        'o+0',
      );
    });

    it('enqueues bootstrap message to root object', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      await manager.connectSystemSubcluster(config);

      expect(kernelQueue.enqueueSend).toHaveBeenCalledWith(
        'ko1',
        expect.objectContaining({
          methargs: expect.any(Object),
        }),
      );
    });

    it('wires syscall handler to transport', async () => {
      const transport = makeMockTransport();
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport }],
      };

      await manager.connectSystemSubcluster(config);

      expect(transport.setSyscallHandler).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('connects multiple vats in a subcluster', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'bootstrap',
        vatTransports: [
          { name: 'bootstrap', transport: makeMockTransport() },
          { name: 'worker', transport: makeMockTransport() },
        ],
      };

      const result = await manager.connectSystemSubcluster(config);

      expect(result.vatIds.bootstrap).toBe('sv0');
      expect(result.vatIds.worker).toBe('sv1');
      expect(kernelStore.initEndpoint).toHaveBeenCalledTimes(2);
    });

    it('uses existing root kref if available', async () => {
      (kernelStore.erefToKref as unknown as MockInstance).mockReturnValueOnce(
        'ko-existing',
      );

      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      await manager.connectSystemSubcluster(config);

      // Should not create new kernel object for root
      // (only kernel facet is created via registerKernelService which is mocked)
      expect(kernelStore.initKernelObject).not.toHaveBeenCalled();
      expect(kernelQueue.enqueueSend).toHaveBeenCalledWith(
        'ko-existing',
        expect.objectContaining({
          methargs: expect.any(Object),
        }),
      );
    });

    it('warns if requested service is not found', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
        services: ['unknownService'],
      };

      await manager.connectSystemSubcluster(config);

      expect(logger.warn).toHaveBeenCalledWith(
        "Kernel service 'unknownService' not found",
      );
    });

    it('includes services in bootstrap message when available', async () => {
      (kernelStore.kv.get as unknown as MockInstance).mockReturnValueOnce(
        'ko-service',
      );

      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
        services: ['myService'],
      };

      await manager.connectSystemSubcluster(config);

      // Check that enqueueSend was called (service is embedded in the serialized methargs)
      expect(kernelQueue.enqueueSend).toHaveBeenCalledWith(
        'ko1',
        expect.objectContaining({
          methargs: expect.any(Object),
        }),
      );
    });

    it('creates singleton kernel facet across multiple subclusters', async () => {
      // Create a manager with a register function that tracks calls
      const registerCalls: string[] = [];
      const managerWithTracking = new SystemSubclusterManager({
        kernelStore,
        kernelQueue,
        kernelFacetDeps,
        registerKernelService: vi.fn().mockImplementation((name: string) => {
          registerCalls.push(name);
          return { kref: 'ko-kernelFacet' };
        }),
        logger,
      });

      const config1: KernelSystemSubclusterConfig = {
        bootstrap: 'vat1',
        vatTransports: [{ name: 'vat1', transport: makeMockTransport() }],
      };
      const config2: KernelSystemSubclusterConfig = {
        bootstrap: 'vat2',
        vatTransports: [{ name: 'vat2', transport: makeMockTransport() }],
      };

      await managerWithTracking.connectSystemSubcluster(config1);
      await managerWithTracking.connectSystemSubcluster(config2);

      // registerKernelService should only be called once (singleton)
      expect(
        registerCalls.filter((name) => name === 'kernelFacet'),
      ).toHaveLength(1);
    });

    it('includes kernelFacet in bootstrap message', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      await manager.connectSystemSubcluster(config);

      // Verify enqueueSend was called with bootstrap message
      expect(kernelQueue.enqueueSend).toHaveBeenCalledWith(
        'ko1',
        expect.objectContaining({
          methargs: expect.objectContaining({
            // The methargs should contain the kernelFacet kref in slots
            slots: expect.arrayContaining(['ko-kernelFacet']),
          }),
        }),
      );
    });
  });

  describe('getSystemVatHandle', () => {
    it('returns handle for connected system vat', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };
      await manager.connectSystemSubcluster(config);

      const handle = manager.getSystemVatHandle('sv0' as SystemVatId);

      expect(handle).toBeDefined();
      expect(handle?.systemVatId).toBe('sv0');
    });

    it('returns undefined for unknown system vat', () => {
      const handle = manager.getSystemVatHandle('sv-unknown' as SystemVatId);

      expect(handle).toBeUndefined();
    });

    it('finds handle across multiple subclusters', async () => {
      const config1: KernelSystemSubclusterConfig = {
        bootstrap: 'vat1',
        vatTransports: [{ name: 'vat1', transport: makeMockTransport() }],
      };
      const config2: KernelSystemSubclusterConfig = {
        bootstrap: 'vat2',
        vatTransports: [{ name: 'vat2', transport: makeMockTransport() }],
      };

      await manager.connectSystemSubcluster(config1);
      await manager.connectSystemSubcluster(config2);

      const handle1 = manager.getSystemVatHandle('sv0' as SystemVatId);
      const handle2 = manager.getSystemVatHandle('sv1' as SystemVatId);

      expect(handle1?.systemVatId).toBe('sv0');
      expect(handle2?.systemVatId).toBe('sv1');
    });
  });
});
