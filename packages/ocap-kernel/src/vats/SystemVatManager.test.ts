import { Logger } from '@metamask/logger';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { KernelFacetDependencies } from '../kernel-facet.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type { StaticSystemVatConfig, SystemVatTransport } from '../types.ts';
import { SystemVatManager } from './SystemVatManager.ts';

describe('SystemVatManager', () => {
  let mockKernelStore: KernelStore;
  let mockKernelQueue: KernelQueue;
  let mockKernelFacetDeps: KernelFacetDependencies;
  let manager: SystemVatManager;
  let mockTransport: SystemVatTransport;

  const makeTransport = (): SystemVatTransport => {
    const connectionPromise = {
      resolve: vi.fn(),
      promise: Promise.resolve(),
    };
    return {
      deliver: vi.fn().mockResolvedValue(null),
      setSyscallHandler: vi.fn(),
      awaitConnection: vi.fn().mockReturnValue(connectionPromise.promise),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockKernelStore = {
      initEndpoint: vi.fn(),
      erefToKref: vi.fn().mockReturnValue(null),
      initKernelObject: vi.fn().mockReturnValue('ko1'),
      addCListEntry: vi.fn(),
      kv: {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
      },
    } as unknown as KernelStore;

    mockKernelQueue = {
      enqueueSend: vi.fn(),
    } as unknown as KernelQueue;

    mockKernelFacetDeps = {
      launchSubcluster: vi.fn(),
      terminateSubcluster: vi.fn(),
      reloadSubcluster: vi.fn(),
      getSubcluster: vi.fn(),
      getSubclusters: vi.fn(),
      getStatus: vi.fn(),
      logger: new Logger('test'),
    };

    mockTransport = makeTransport();

    manager = new SystemVatManager({
      kernelStore: mockKernelStore,
      kernelQueue: mockKernelQueue,
      kernelFacetDeps: mockKernelFacetDeps,
      registerKernelService: vi.fn().mockReturnValue({ kref: 'ko0' }),
      logger: new Logger('test'),
    });
  });

  describe('prepareStaticSystemVat', () => {
    it('allocates system vat ID starting from sv0', () => {
      const config: StaticSystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      const result = manager.prepareStaticSystemVat(config);

      expect(result.systemVatId).toBe('sv0');
    });

    it('allocates sequential system vat IDs', () => {
      const config1: StaticSystemVatConfig = {
        name: 'vat1',
        transport: makeTransport(),
      };
      const config2: StaticSystemVatConfig = {
        name: 'vat2',
        transport: makeTransport(),
      };

      const result1 = manager.prepareStaticSystemVat(config1);
      const result2 = manager.prepareStaticSystemVat(config2);

      expect(result1.systemVatId).toBe('sv0');
      expect(result2.systemVatId).toBe('sv1');
    });

    it('initializes endpoint in kernel store', () => {
      const config: StaticSystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      manager.prepareStaticSystemVat(config);

      expect(mockKernelStore.initEndpoint).toHaveBeenCalledWith('sv0');
    });

    it('creates root kernel object if not exists', () => {
      const config: StaticSystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      manager.prepareStaticSystemVat(config);

      expect(mockKernelStore.initKernelObject).toHaveBeenCalledWith('sv0');
      expect(mockKernelStore.addCListEntry).toHaveBeenCalledWith(
        'sv0',
        'ko1',
        'o+0',
      );
    });

    it('uses existing root kref if already exists', () => {
      (mockKernelStore.erefToKref as ReturnType<typeof vi.fn>).mockReturnValue(
        'ko99',
      );
      const config: StaticSystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      manager.prepareStaticSystemVat(config);

      expect(mockKernelStore.initKernelObject).not.toHaveBeenCalled();
      expect(mockKernelStore.addCListEntry).not.toHaveBeenCalled();
    });

    it('sets syscall handler on transport', () => {
      const config: StaticSystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      manager.prepareStaticSystemVat(config);

      expect(mockTransport.setSyscallHandler).toHaveBeenCalled();
    });

    it('waits for connection before sending bootstrap', async () => {
      let resolveConnection: () => void;
      const connectionPromise = new Promise<void>((resolve) => {
        resolveConnection = resolve;
      });
      const transport: SystemVatTransport = {
        deliver: vi.fn().mockResolvedValue(null),
        setSyscallHandler: vi.fn(),
        awaitConnection: vi.fn().mockReturnValue(connectionPromise),
      };

      const config: StaticSystemVatConfig = {
        name: 'testVat',
        transport,
      };

      manager.prepareStaticSystemVat(config);

      // Bootstrap should not be sent yet
      expect(mockKernelQueue.enqueueSend).not.toHaveBeenCalled();

      // Resolve connection
      resolveConnection!();
      await connectionPromise;

      // Give time for async handler to run
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Now bootstrap should be sent
      expect(mockKernelQueue.enqueueSend).toHaveBeenCalled();
    });
  });

  describe('getSystemVatHandle', () => {
    it('returns handle for prepared system vat', () => {
      const config: StaticSystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      manager.prepareStaticSystemVat(config);
      const handle = manager.getSystemVatHandle('sv0');

      expect(handle).toBeDefined();
    });

    it('returns undefined for non-existent system vat', () => {
      const handle = manager.getSystemVatHandle('sv999');

      expect(handle).toBeUndefined();
    });

    it('returns correct handle for multiple system vats', () => {
      const config1: StaticSystemVatConfig = {
        name: 'vat1',
        transport: makeTransport(),
      };
      const config2: StaticSystemVatConfig = {
        name: 'vat2',
        transport: makeTransport(),
      };

      manager.prepareStaticSystemVat(config1);
      manager.prepareStaticSystemVat(config2);

      const handle1 = manager.getSystemVatHandle('sv0');
      const handle2 = manager.getSystemVatHandle('sv1');

      expect(handle1).toBeDefined();
      expect(handle2).toBeDefined();
      expect(handle1).not.toBe(handle2);
    });
  });

  describe('disconnectSystemVat', () => {
    it('removes system vat from tracking', async () => {
      const config: StaticSystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      manager.prepareStaticSystemVat(config);
      expect(manager.getSystemVatHandle('sv0')).toBeDefined();

      await manager.disconnectSystemVat('sv0');
      expect(manager.getSystemVatHandle('sv0')).toBeUndefined();
    });

    it('handles disconnect of non-existent vat gracefully', async () => {
      // Should not throw
      const result = await manager.disconnectSystemVat('sv999');
      expect(result).toBeUndefined();
    });
  });

  describe('registerDynamicSystemVat', () => {
    it('allocates system vat ID', async () => {
      const connectionKit = {
        resolve: vi.fn(),
        promise: Promise.resolve(),
      };
      const transport: SystemVatTransport = {
        deliver: vi.fn().mockResolvedValue(null),
        setSyscallHandler: vi.fn(),
        awaitConnection: vi.fn().mockReturnValue(connectionKit.promise),
      };

      const result = await manager.registerDynamicSystemVat({
        name: 'dynamicVat',
        transport,
      });

      expect(result.systemVatId).toBe('sv0');
    });

    it('returns root kref and disconnect function', async () => {
      const transport: SystemVatTransport = {
        deliver: vi.fn().mockResolvedValue(null),
        setSyscallHandler: vi.fn(),
        awaitConnection: vi.fn().mockResolvedValue(undefined),
      };

      const result = await manager.registerDynamicSystemVat({
        name: 'dynamicVat',
        transport,
      });

      expect(result.rootKref).toBe('ko1');
      expect(typeof result.disconnect).toBe('function');
    });

    it('sends bootstrap after awaiting connection', async () => {
      const transport: SystemVatTransport = {
        deliver: vi.fn().mockResolvedValue(null),
        setSyscallHandler: vi.fn(),
        awaitConnection: vi.fn().mockResolvedValue(undefined),
      };

      await manager.registerDynamicSystemVat({
        name: 'dynamicVat',
        transport,
      });

      expect(mockKernelQueue.enqueueSend).toHaveBeenCalled();
    });

    it('disconnect function removes vat', async () => {
      const transport: SystemVatTransport = {
        deliver: vi.fn().mockResolvedValue(null),
        setSyscallHandler: vi.fn(),
        awaitConnection: vi.fn().mockResolvedValue(undefined),
      };

      const result = await manager.registerDynamicSystemVat({
        name: 'dynamicVat',
        transport,
      });

      expect(manager.getSystemVatHandle(result.systemVatId)).toBeDefined();
      await result.disconnect();
      expect(manager.getSystemVatHandle(result.systemVatId)).toBeUndefined();
    });
  });
});
