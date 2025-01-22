import '@ocap/test-utils/mock-endoify';
import { define, literal, object } from '@metamask/superstruct';
import type {
  Kernel,
  KernelCommand,
  VatId,
  VatConfig,
  KVStore,
} from '@ocap/kernel';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { KernelControlCommand } from './messages.js';

// Mock logger
vi.mock('@ocap/utils', () => ({
  makeLogger: () => ({
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

let isVatConfigMock = true;
let isVatIdMock = true;

// Mock kernel validation functions
// because vitest needs to extend Error stack and under SES it fails
vi.mock('@ocap/kernel', () => ({
  isKernelCommand: () => true,
  isVatId: () => isVatIdMock,
  isVatConfig: () => isVatConfigMock,
  VatIdStruct: define<VatId>('VatId', () => isVatIdMock),
  VatConfigStruct: define<VatConfig>('VatConfig', () => isVatConfigMock),
  KernelSendMessageStruct: object({
    id: literal('v0'),
    payload: object({
      method: literal('ping'),
      params: literal(null),
    }),
  }),
}));

describe('handlePanelMessage', () => {
  let mockKernel: Kernel;
  let mockKVStore: KVStore;

  beforeEach(() => {
    vi.resetModules();

    isVatConfigMock = true;
    isVatIdMock = true;
    mockKVStore = {
      get: vi.fn(),
      getRequired: vi.fn(),
      getNextKey: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      executeQuery: vi.fn(),
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
      sendMessage: vi.fn((id: VatId, _message: KernelCommand) => {
        if (id === 'v0') {
          return 'success';
        }
        return { error: 'Unknown vat ID' };
      }),
      reset: vi.fn().mockResolvedValue(undefined),
    } as unknown as Kernel;
  });

  describe('vat management commands', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle launchVat command', { timeout: 5000 }, async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        id: 'test-1',
        payload: {
          method: 'launchVat',
          params: { sourceSpec: 'bogus.js' },
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(mockKernel.launchVat).toHaveBeenCalledWith({
        sourceSpec: 'bogus.js',
      });
      expect(response).toStrictEqual({
        id: 'test-1',
        payload: {
          method: 'launchVat',
          params: null,
        },
      });
    });

    it('should handle invalid vat configuration', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      isVatConfigMock = false;

      const message: KernelControlCommand = {
        id: 'test-2',
        payload: {
          method: 'launchVat',
          params: { bogus: 'bogus.js' } as unknown as VatConfig,
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(response).toStrictEqual({
        id: 'test-2',
        payload: {
          method: 'launchVat',
          params: {
            error:
              'Expected a value of type `VatConfig`, but received: `[object Object]`',
          },
        },
      });
    });

    it('should handle restartVat command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        id: 'test-3',
        payload: {
          method: 'restartVat',
          params: { id: 'v0' },
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(mockKernel.restartVat).toHaveBeenCalledWith('v0');
      expect(response).toStrictEqual({
        id: 'test-3',
        payload: {
          method: 'restartVat',
          params: null,
        },
      });
    });

    it('should handle invalid vat ID for restartVat command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      isVatIdMock = false;

      const message: KernelControlCommand = {
        id: 'test-4',
        payload: {
          method: 'restartVat',
          params: { id: 'invalid' as VatId },
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(response).toStrictEqual({
        id: 'test-4',
        payload: {
          method: 'restartVat',
          params: {
            error:
              'At path: id -- Expected a value of type `VatId`, but received: `"invalid"`',
          },
        },
      });
    });

    it('should handle terminateVat command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        id: 'test-5',
        payload: {
          method: 'terminateVat',
          params: { id: 'v0' },
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(mockKernel.terminateVat).toHaveBeenCalledWith('v0');
      expect(response).toStrictEqual({
        id: 'test-5',
        payload: {
          method: 'terminateVat',
          params: null,
        },
      });
    });

    it('should handle terminateAllVats command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        id: 'test-6',
        payload: {
          method: 'terminateAllVats',
          params: null,
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(mockKernel.terminateAllVats).toHaveBeenCalled();
      expect(response).toStrictEqual({
        id: 'test-6',
        payload: {
          method: 'terminateAllVats',
          params: null,
        },
      });
    });
  });

  describe('status command', () => {
    it('should handle getStatus command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        id: 'test-7',
        payload: {
          method: 'getStatus',
          params: null,
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(mockKernel.getVats).toHaveBeenCalled();
      expect(response).toStrictEqual({
        id: 'test-7',
        payload: {
          method: 'getStatus',
          params: {
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
          },
        },
      });
    });
  });

  describe('sendMessage command', () => {
    it('should handle vat messages', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        id: 'test-11',
        payload: {
          method: 'sendMessage',
          params: {
            id: 'v0',
            payload: { method: 'ping', params: null },
          },
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(mockKernel.sendMessage).toHaveBeenCalledWith('v0', {
        method: 'ping',
        params: null,
      });
      expect(response).toStrictEqual({
        id: 'test-11',
        payload: {
          method: 'sendMessage',
          params: { result: 'success' },
        },
      });
    });

    it('should handle invalid command payload', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const kernel = await import('@ocap/kernel');
      const kernelSpy = vi.spyOn(kernel, 'isKernelCommand');
      kernelSpy.mockReturnValue(false);

      const message: KernelControlCommand = {
        id: 'test-12',
        payload: {
          method: 'sendMessage',
          params: {
            payload: { invalid: 'command' },
          },
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(response).toStrictEqual({
        id: 'test-12',
        payload: {
          method: 'sendMessage',
          params: { error: 'Invalid command payload' },
        },
      });
    });

    it('should handle missing vat ID', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const kernel = await import('@ocap/kernel');
      const isVatIdSpy = vi.spyOn(kernel, 'isVatId');
      isVatIdSpy.mockReturnValue(false);

      const message: KernelControlCommand = {
        id: 'test-13',
        payload: {
          method: 'sendMessage',
          params: {
            payload: { method: 'ping', params: null },
          },
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(response).toStrictEqual({
        id: 'test-13',
        payload: {
          method: 'sendMessage',
          params: { error: 'Vat ID required for this command' },
        },
      });
    });
  });

  describe('error handling', () => {
    it('should handle unknown method', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        id: 'test-14',
        payload: {
          method: 'unknownMethod',
          params: null,
        },
      } as unknown as KernelControlCommand;

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(response).toStrictEqual({
        id: 'test-14',
        payload: {
          method: 'unknownMethod',
          params: { error: 'Unknown method: unknownMethod' },
        },
      });
    });

    it('should handle kernel errors', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const error = new Error('Kernel error');
      vi.mocked(mockKernel.launchVat).mockRejectedValue(error);

      const message: KernelControlCommand = {
        id: 'test-15',
        payload: {
          method: 'launchVat',
          params: { sourceSpec: 'bogus.js' },
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(response).toStrictEqual({
        id: 'test-15',
        payload: {
          method: 'launchVat',
          params: { error: 'Kernel error' },
        },
      });

      vi.mocked(mockKernel.launchVat).mockRejectedValue('error');

      const response2 = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(response2).toStrictEqual({
        id: 'test-15',
        payload: {
          method: 'launchVat',
          params: { error: 'error' },
        },
      });
    });
  });

  describe('clearState command', () => {
    it('should handle clearState command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        id: 'test-16',
        payload: {
          method: 'clearState',
          params: null,
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(mockKernel.reset).toHaveBeenCalled();
      expect(response).toStrictEqual({
        id: 'test-16',
        payload: {
          method: 'clearState',
          params: null,
        },
      });
    });

    it('should handle clearState errors', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      vi.mocked(mockKernel.reset).mockRejectedValue(new Error('Reset failed'));

      const message: KernelControlCommand = {
        id: 'test-17',
        payload: {
          method: 'clearState',
          params: null,
        },
      };

      const response = await handlePanelMessage(
        mockKernel,
        mockKVStore,
        message,
      );

      expect(response).toStrictEqual({
        id: 'test-17',
        payload: {
          method: 'clearState',
          params: { error: 'Reset failed' },
        },
      });
    });
  });
});
