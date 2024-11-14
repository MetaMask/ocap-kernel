import '../../../test-utils/src/env/mock-endo.ts';
import { define, literal, object } from '@metamask/superstruct';
import type { Kernel, KernelCommand, VatId } from '@ocap/kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelControlCommand } from './messages.js';

// Mock logger
vi.mock('@ocap/utils', () => ({
  makeLogger: () => ({
    error: vi.fn(),
  }),
}));

// Mock kernel validation functions
vi.mock('@ocap/kernel', () => ({
  isKernelCommand: () => true,
  isVatId: () => true,
  VatIdStruct: define<VatId>('VatId', () => true),
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

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();

    // Create mock kernel
    mockKernel = {
      launchVat: vi.fn().mockResolvedValue(undefined),
      restartVat: vi.fn().mockResolvedValue(undefined),
      terminateVat: vi.fn().mockResolvedValue(undefined),
      terminateAllVats: vi.fn().mockResolvedValue(undefined),
      getVatIds: vi.fn().mockReturnValue(['v0', 'v1']),
      sendMessage: vi.fn((id: VatId, _message: KernelCommand) => {
        if (id === 'v0') {
          return 'success';
        }
        return { error: 'Unknown vat ID' };
      }),
      kvGet: vi.fn((key: string) => {
        if (key === 'testKey') {
          return 'value';
        }
        return undefined;
      }),
      kvSet: vi.fn(),
    } as unknown as Kernel;
  });

  describe('vat management commands', () => {
    it('should handle launchVat command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        method: 'launchVat',
        params: { id: 'v0' },
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(mockKernel.launchVat).toHaveBeenCalledWith({ id: 'v0' });
      expect(response).toStrictEqual({
        method: 'launchVat',
        params: null,
      });
    });

    it('should handle restartVat command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        method: 'restartVat',
        params: { id: 'v0' },
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(mockKernel.restartVat).toHaveBeenCalledWith('v0');
      expect(response).toStrictEqual({
        method: 'restartVat',
        params: null,
      });
    });

    it('should handle terminateVat command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        method: 'terminateVat',
        params: { id: 'v0' },
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(mockKernel.terminateVat).toHaveBeenCalledWith('v0');
      expect(response).toStrictEqual({
        method: 'terminateVat',
        params: null,
      });
    });

    it('should handle terminateAllVats command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        method: 'terminateAllVats',
        params: null,
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(mockKernel.terminateAllVats).toHaveBeenCalled();
      expect(response).toStrictEqual({
        method: 'terminateAllVats',
        params: null,
      });
    });
  });

  describe('status command', () => {
    it('should handle getStatus command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        method: 'getStatus',
        params: null,
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(mockKernel.getVatIds).toHaveBeenCalled();
      expect(response).toStrictEqual({
        method: 'getStatus',
        params: {
          isRunning: true,
          activeVats: ['v0', 'v1'],
        },
      });
    });
  });

  describe('sendMessage command', () => {
    it('should handle kvGet command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        method: 'sendMessage',
        params: {
          payload: { method: 'kvGet', params: 'testKey' },
        },
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(mockKernel.kvGet).toHaveBeenCalledWith('testKey');
      expect(response).toStrictEqual({
        method: 'sendMessage',
        params: { result: 'value' },
      });
    });

    it('should handle kvGet command when key not found', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');

      const message: KernelControlCommand = {
        method: 'sendMessage',
        params: {
          payload: { method: 'kvGet', params: 'nonexistentKey' },
        },
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(mockKernel.kvGet).toHaveBeenCalledWith('nonexistentKey');
      expect(response).toStrictEqual({
        method: 'sendMessage',
        params: { error: 'Key not found' },
      });
    });

    it('should handle kvSet command', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        method: 'sendMessage',
        params: {
          payload: {
            method: 'kvSet',
            params: { key: 'testKey', value: 'testValue' },
          },
        },
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(mockKernel.kvSet).toHaveBeenCalledWith('testKey', 'testValue');
      expect(response).toStrictEqual({
        method: 'sendMessage',
        params: { key: 'testKey', value: 'testValue' },
      });
    });

    it('should handle vat messages', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        method: 'sendMessage',
        params: {
          id: 'v0',
          payload: { method: 'ping', params: null },
        },
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(mockKernel.sendMessage).toHaveBeenCalledWith('v0', {
        method: 'ping',
        params: null,
      });
      expect(response).toStrictEqual({
        method: 'sendMessage',
        params: { result: 'success' },
      });
    });

    it('should handle invalid command payload', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const kernel = await import('@ocap/kernel');
      const kernelSpy = vi.spyOn(kernel, 'isKernelCommand');
      kernelSpy.mockReturnValue(false);

      const message: KernelControlCommand = {
        method: 'sendMessage',
        params: {
          payload: { invalid: 'command' },
        },
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(response).toStrictEqual({
        method: 'sendMessage',
        params: { error: 'Invalid command payload' },
      });
    });

    it('should handle missing vat ID', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const kernel = await import('@ocap/kernel');
      const isVatIdSpy = vi.spyOn(kernel, 'isVatId');
      isVatIdSpy.mockReturnValue(false);

      const message: KernelControlCommand = {
        method: 'sendMessage',
        params: {
          payload: { method: 'ping', params: null },
        },
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(response).toStrictEqual({
        method: 'sendMessage',
        params: { error: 'Vat ID required for this command' },
      });
    });
  });

  describe('error handling', () => {
    it('should handle unknown method', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const message: KernelControlCommand = {
        method: 'unknownMethod',
        params: null,
      } as unknown as KernelControlCommand;

      const response = await handlePanelMessage(mockKernel, message);

      expect(response).toStrictEqual({
        method: 'sendMessage',
        params: { error: 'Unknown method' },
      });
    });

    it('should handle kernel errors', async () => {
      const { handlePanelMessage } = await import('./handle-panel-message');
      const error = new Error('Kernel error');
      vi.mocked(mockKernel.launchVat).mockRejectedValue(error);

      const message: KernelControlCommand = {
        method: 'launchVat',
        params: { id: 'v0' },
      };

      const response = await handlePanelMessage(mockKernel, message);

      expect(response).toStrictEqual({
        method: 'sendMessage',
        params: { error: 'Kernel error' },
      });

      vi.mocked(mockKernel.launchVat).mockRejectedValue('error');

      const response2 = await handlePanelMessage(mockKernel, message);

      expect(response2).toStrictEqual({
        method: 'sendMessage',
        params: { error: 'error' },
      });
    });
  });
});
