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
      logger,
    });
  });

  describe('connectSystemSubcluster', () => {
    it('waits for crank before connecting', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      await manager.connectSystemSubcluster(config);

      expect(kernelQueue.waitForCrank).toHaveBeenCalled();
    });

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

      expect(kernelQueue.enqueueMessage).toHaveBeenCalledWith(
        'ko1',
        'bootstrap',
        expect.any(Array),
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

      // Should not create new kernel object for root (only for kernelFacet)
      expect(kernelStore.initKernelObject).toHaveBeenCalledTimes(1);
      expect(kernelStore.initKernelObject).toHaveBeenCalledWith('kernel');
      expect(kernelQueue.enqueueMessage).toHaveBeenCalledWith(
        'ko-existing',
        'bootstrap',
        expect.any(Array),
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

      expect(kernelQueue.enqueueMessage).toHaveBeenCalledWith(
        'ko1',
        'bootstrap',
        [
          expect.anything(),
          expect.objectContaining({ myService: expect.anything() }),
          expect.anything(),
        ],
      );
    });

    it('creates singleton kernel facet across multiple subclusters', async () => {
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

      // initKernelObject for 'kernel' should only be called once (singleton)
      const kernelCalls = (
        kernelStore.initKernelObject as unknown as MockInstance
      ).mock.calls.filter((call) => call[0] === 'kernel');
      expect(kernelCalls).toHaveLength(1);
    });

    it('includes kernelFacet in bootstrap message', async () => {
      const config: KernelSystemSubclusterConfig = {
        bootstrap: 'testVat',
        vatTransports: [{ name: 'testVat', transport: makeMockTransport() }],
      };

      await manager.connectSystemSubcluster(config);

      // Bootstrap message should have 3 arguments: roots, services, kernelFacet
      const callArgs = (kernelQueue.enqueueMessage as unknown as MockInstance)
        .mock.calls[0];
      expect(callArgs).toHaveLength(3);
      const [kref, method, args] = callArgs as [string, string, unknown[]];
      expect(kref).toBe('ko1');
      expect(method).toBe('bootstrap');
      expect(args).toHaveLength(3);

      // Third arg is kernelFacet slot (an exo with getKref method)
      const kernelFacetSlot = args[2] as { getKref?: () => string };
      expect(typeof kernelFacetSlot.getKref).toBe('function');
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
