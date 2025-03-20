import type { Kernel, KernelCommand, VatId, VatConfig } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';
import { setupOcapKernelMock } from '@ocap/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { KernelCommandRegistry } from './command-registry.ts';
import type { CommandHandler } from './command-registry.ts';
import { handlers } from './handlers/index.ts';

// Mock logger
vi.mock('@ocap/utils', async (importOriginal) => ({
  ...(await importOriginal()),
  makeLogger: () => ({
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const { setMockBehavior, resetMocks } = setupOcapKernelMock();

describe('KernelCommandRegistry', () => {
  let registry: KernelCommandRegistry;
  let mockKernel: Kernel;
  let mockKernelDatabase: KernelDatabase;

  beforeEach(() => {
    vi.resetModules();
    resetMocks();

    mockKernelDatabase = {
      kernelKVStore: {
        get: vi.fn(),
        getRequired: vi.fn(),
        getNextKey: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
      },
      clear: vi.fn(),
      executeQuery: vi.fn(),
      makeVatStore: vi.fn(),
    };

    // Create mock kernel
    mockKernel = {
      launchVat: vi.fn().mockResolvedValue(undefined),
      restartVat: vi.fn().mockResolvedValue(undefined),
      terminateVat: vi.fn().mockResolvedValue(undefined),
      terminateAllVats: vi.fn().mockResolvedValue(undefined),
      clearStorage: vi.fn().mockResolvedValue(undefined),
      getVatIds: vi.fn().mockReturnValue(['v0', 'v1']),
      getVats: vi.fn().mockReturnValue([
        {
          id: 'v0',
          config: { bundleSpec: 'http://localhost:3000/sample-vat.bundle' },
        },
        {
          id: 'v1',
          config: { bundleSpec: 'http://localhost:3000/sample-vat.bundle' },
        },
      ]),
      sendVatCommand: vi.fn((id: VatId, _message: KernelCommand) => {
        if (id === 'v0') {
          return 'success';
        }
        return { error: 'Unknown vat ID' };
      }),
      reset: vi.fn().mockResolvedValue(undefined),
    } as unknown as Kernel;

    registry = new KernelCommandRegistry();
    handlers.forEach((handler) => {
      registry.register(handler as CommandHandler<typeof handler.method>);
    });
  });

  describe('vat management commands', () => {
    it('should handle launchVat command', async () => {
      const result = await registry.execute(
        mockKernel,
        mockKernelDatabase,
        'launchVat',
        {
          sourceSpec: 'bogus.js',
        },
      );

      expect(mockKernel.launchVat).toHaveBeenCalledWith({
        sourceSpec: 'bogus.js',
      });
      expect(result).toBeNull();
    });

    it('should handle invalid vat configuration', async () => {
      setMockBehavior({ isVatConfig: false });

      await expect(
        registry.execute(mockKernel, mockKernelDatabase, 'launchVat', {
          bogus: 'bogus.js',
        } as unknown as VatConfig),
      ).rejects.toThrow(/Expected a value of type `VatConfig`/u);
    });

    it('should handle restartVat command', async () => {
      const result = await registry.execute(
        mockKernel,
        mockKernelDatabase,
        'restartVat',
        {
          id: 'v0',
        },
      );

      expect(mockKernel.restartVat).toHaveBeenCalledWith('v0');
      expect(result).toBeNull();
    });

    it('should handle invalid vat ID for restartVat command', async () => {
      setMockBehavior({ isVatId: false });

      await expect(
        registry.execute(mockKernel, mockKernelDatabase, 'restartVat', {
          id: 'invalid',
        }),
      ).rejects.toThrow(/Expected a value of type `VatId`/u);
    });

    it('should handle terminateVat command', async () => {
      const result = await registry.execute(
        mockKernel,
        mockKernelDatabase,
        'terminateVat',
        {
          id: 'v0',
        },
      );

      expect(mockKernel.terminateVat).toHaveBeenCalledWith('v0');
      expect(result).toBeNull();
    });

    it('should handle terminateAllVats command', async () => {
      const result = await registry.execute(
        mockKernel,
        mockKernelDatabase,
        'terminateAllVats',
        [],
      );

      expect(mockKernel.terminateAllVats).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('status command', () => {
    it('should handle getStatus command', async () => {
      const result = await registry.execute(
        mockKernel,
        mockKernelDatabase,
        'getStatus',
        [],
      );

      expect(mockKernel.getVats).toHaveBeenCalled();
      expect(result).toStrictEqual({
        clusterConfig: undefined,
        vats: [
          {
            id: 'v0',
            config: {
              bundleSpec: 'http://localhost:3000/sample-vat.bundle',
            },
          },
          {
            id: 'v1',
            config: {
              bundleSpec: 'http://localhost:3000/sample-vat.bundle',
            },
          },
        ],
      });
    });
  });

  describe('sendVatCommand command', () => {
    it('should handle vat commands', async () => {
      const result = await registry.execute(
        mockKernel,
        mockKernelDatabase,
        'sendVatCommand',
        {
          id: 'v0',
          payload: { method: 'ping', params: [] },
        },
      );

      expect(mockKernel.sendVatCommand).toHaveBeenCalledWith('v0', {
        method: 'ping',
        params: [],
      });
      expect(result).toStrictEqual({ result: 'success' });
    });

    it('should handle invalid command payload', async () => {
      setMockBehavior({ isKernelCommand: false });

      await expect(
        registry.execute(mockKernel, mockKernelDatabase, 'sendVatCommand', {
          id: 'v0',
          payload: { invalid: 'command' },
        }),
      ).rejects.toThrow('Invalid command payload');
    });

    it('should handle missing vat ID', async () => {
      setMockBehavior({ isVatId: false });

      await expect(
        registry.execute(mockKernel, mockKernelDatabase, 'sendVatCommand', {
          id: null,
          payload: { method: 'ping', params: [] },
        }),
      ).rejects.toThrow('Vat ID required for this command');
    });
  });

  describe('error handling', () => {
    it('should handle unknown method', async () => {
      await expect(
        // @ts-expect-error Testing invalid method
        registry.execute(mockKernel, mockKernelDatabase, 'unknownMethod', null),
      ).rejects.toThrow('Unknown method: unknownMethod');
    });

    it('should handle kernel errors', async () => {
      const error = new Error('Kernel error');
      vi.mocked(mockKernel.launchVat).mockRejectedValue(error);

      await expect(
        registry.execute(mockKernel, mockKernelDatabase, 'launchVat', {
          sourceSpec: 'bogus.js',
        }),
      ).rejects.toThrow('Kernel error');

      vi.mocked(mockKernel.launchVat).mockRejectedValue('error');

      await expect(
        registry.execute(mockKernel, mockKernelDatabase, 'launchVat', {
          sourceSpec: 'bogus.js',
        }),
      ).rejects.toThrow('error');
    });
  });

  describe('clearState command', () => {
    it('should handle clearState command', async () => {
      const result = await registry.execute(
        mockKernel,
        mockKernelDatabase,
        'clearState',
        [],
      );

      expect(mockKernel.reset).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should handle clearState errors', async () => {
      vi.mocked(mockKernel.reset).mockRejectedValue(new Error('Reset failed'));

      await expect(
        registry.execute(mockKernel, mockKernelDatabase, 'clearState', []),
      ).rejects.toThrow('Reset failed');
    });
  });
});
