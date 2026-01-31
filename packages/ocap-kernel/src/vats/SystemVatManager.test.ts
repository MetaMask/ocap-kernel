import { Logger } from '@metamask/logger';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { KernelFacetDependencies } from '../kernel-facet.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type { SystemVatConfig, SystemVatTransport } from '../types.ts';
import { SystemVatManager } from './SystemVatManager.ts';

describe('SystemVatManager', () => {
  let mockKernelStore: KernelStore;
  let mockKernelQueue: KernelQueue;
  let mockKernelFacetDeps: KernelFacetDependencies;
  let manager: SystemVatManager;
  let mockTransport: SystemVatTransport;

  const makeTransport = (): SystemVatTransport => {
    return {
      deliver: vi.fn().mockResolvedValue(null),
      setSyscallHandler: vi.fn(),
      awaitConnection: vi.fn().mockResolvedValue(undefined),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockKernelStore = {
      initEndpoint: vi.fn(),
      erefToKref: vi.fn().mockReturnValue(null),
      initKernelObject: vi.fn().mockReturnValue('ko1'),
      addCListEntry: vi.fn(),
      getPromisesByDecider: vi.fn().mockReturnValue([]),
      deleteEndpoint: vi.fn(),
      cleanupTerminatedVat: vi
        .fn()
        .mockReturnValue({ exports: 0, imports: 0, promises: 0, kv: 0 }),
      kv: {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
      },
    } as unknown as KernelStore;

    mockKernelQueue = {
      enqueueSend: vi.fn(),
      resolvePromises: vi.fn(),
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

  describe('registerSystemVat', () => {
    it('allocates system vat ID starting from sv0', async () => {
      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      const result = await manager.registerSystemVat(config);

      expect(result.systemVatId).toBe('sv0');
    });

    it('allocates sequential system vat IDs', async () => {
      const config1: SystemVatConfig = {
        name: 'vat1',
        transport: makeTransport(),
      };
      const config2: SystemVatConfig = {
        name: 'vat2',
        transport: makeTransport(),
      };

      const result1 = await manager.registerSystemVat(config1);
      const result2 = await manager.registerSystemVat(config2);

      expect(result1.systemVatId).toBe('sv0');
      expect(result2.systemVatId).toBe('sv1');
    });

    it('initializes endpoint in kernel store', async () => {
      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      await manager.registerSystemVat(config);

      expect(mockKernelStore.initEndpoint).toHaveBeenCalledWith('sv0');
    });

    it('creates root kernel object if not exists', async () => {
      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      await manager.registerSystemVat(config);

      expect(mockKernelStore.initKernelObject).toHaveBeenCalledWith('sv0');
      expect(mockKernelStore.addCListEntry).toHaveBeenCalledWith(
        'sv0',
        'ko1',
        'o+0',
      );
    });

    it('uses existing root kref if already exists', async () => {
      (mockKernelStore.erefToKref as ReturnType<typeof vi.fn>).mockReturnValue(
        'ko99',
      );
      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      await manager.registerSystemVat(config);

      expect(mockKernelStore.initKernelObject).not.toHaveBeenCalled();
      expect(mockKernelStore.addCListEntry).not.toHaveBeenCalled();
    });

    it('sets syscall handler on transport', async () => {
      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      await manager.registerSystemVat(config);

      expect(mockTransport.setSyscallHandler).toHaveBeenCalled();
    });

    it('awaits connection before sending bootstrap', async () => {
      let resolveConnection: () => void;
      const connectionPromise = new Promise<void>((resolve) => {
        resolveConnection = resolve;
      });
      const transport: SystemVatTransport = {
        deliver: vi.fn().mockResolvedValue(null),
        setSyscallHandler: vi.fn(),
        awaitConnection: vi.fn().mockReturnValue(connectionPromise),
      };

      const config: SystemVatConfig = {
        name: 'testVat',
        transport,
      };

      // Start registration (will await connection)
      const registrationPromise = manager.registerSystemVat(config);

      // Bootstrap should not be sent yet
      expect(mockKernelQueue.enqueueSend).not.toHaveBeenCalled();

      // Resolve connection
      resolveConnection!();

      // Wait for registration to complete
      await registrationPromise;

      // Now bootstrap should be sent
      expect(mockKernelQueue.enqueueSend).toHaveBeenCalled();
    });

    it('returns root kref and disconnect function', async () => {
      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      const result = await manager.registerSystemVat(config);

      expect(result.rootKref).toBe('ko1');
      expect(typeof result.disconnect).toBe('function');
    });

    it('disconnect function removes vat', async () => {
      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      const result = await manager.registerSystemVat(config);

      expect(manager.getSystemVatHandle(result.systemVatId)).toBeDefined();
      await result.disconnect();
      expect(manager.getSystemVatHandle(result.systemVatId)).toBeUndefined();
    });
  });

  describe('getSystemVatHandle', () => {
    it('returns handle for registered system vat', async () => {
      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      await manager.registerSystemVat(config);
      const handle = manager.getSystemVatHandle('sv0');

      expect(handle).toBeDefined();
    });

    it('returns undefined for non-existent system vat', () => {
      const handle = manager.getSystemVatHandle('sv999');

      expect(handle).toBeUndefined();
    });

    it('returns correct handle for multiple system vats', async () => {
      const config1: SystemVatConfig = {
        name: 'vat1',
        transport: makeTransport(),
      };
      const config2: SystemVatConfig = {
        name: 'vat2',
        transport: makeTransport(),
      };

      await manager.registerSystemVat(config1);
      await manager.registerSystemVat(config2);

      const handle1 = manager.getSystemVatHandle('sv0');
      const handle2 = manager.getSystemVatHandle('sv1');

      expect(handle1).toBeDefined();
      expect(handle2).toBeDefined();
      expect(handle1).not.toBe(handle2);
    });
  });

  describe('disconnectSystemVat', () => {
    it('removes system vat from tracking', async () => {
      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      await manager.registerSystemVat(config);
      expect(manager.getSystemVatHandle('sv0')).toBeDefined();

      await manager.disconnectSystemVat('sv0');
      expect(manager.getSystemVatHandle('sv0')).toBeUndefined();
    });

    it('handles disconnect of non-existent vat gracefully', async () => {
      // Should not throw
      const result = await manager.disconnectSystemVat('sv999');
      expect(result).toBeUndefined();
    });

    it('rejects pending promises where vat is decider', async () => {
      (
        mockKernelStore.getPromisesByDecider as ReturnType<typeof vi.fn>
      ).mockReturnValue(['kp1', 'kp2']);

      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      await manager.registerSystemVat(config);
      await manager.disconnectSystemVat('sv0');

      expect(mockKernelStore.getPromisesByDecider).toHaveBeenCalledWith('sv0');
      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledTimes(2);
    });

    it('cleans up endpoint in kernel store', async () => {
      const config: SystemVatConfig = {
        name: 'testVat',
        transport: mockTransport,
      };

      await manager.registerSystemVat(config);
      await manager.disconnectSystemVat('sv0');

      expect(mockKernelStore.cleanupTerminatedVat).toHaveBeenCalledWith('sv0');
    });
  });
});
