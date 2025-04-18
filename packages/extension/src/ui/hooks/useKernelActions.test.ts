import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import clusterConfig from '../../vats/default-cluster.json';

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

vi.mock('@ocap/utils', async (importOriginal) => ({
  ...(await importOriginal()),
  stringify: JSON.stringify,
}));

describe('useKernelActions', () => {
  const mockSendMessage = vi.fn();
  const mockLogMessage = vi.fn();
  const mockMessageContent = '{"test": "content"}';

  beforeEach(async () => {
    const { usePanelContext } = await import('../context/PanelContext.tsx');
    vi.mocked(usePanelContext).mockReturnValue({
      callKernelMethod: mockSendMessage,
      logMessage: mockLogMessage,
      messageContent: mockMessageContent,
      setMessageContent: vi.fn(),
      status: undefined,
      panelLogs: [],
      clearLogs: vi.fn(),
      isLoading: false,
    });
  });

  describe('sendKernelCommand', () => {
    it('sends message with payload', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());
      const expectedParams = { test: 'content' };
      mockSendMessage.mockResolvedValueOnce({ success: true });
      result.current.sendKernelCommand();
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'sendVatCommand',
          params: expectedParams,
        });
      });
    });

    it('logs success response', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());
      const response = { success: true };

      mockSendMessage.mockResolvedValueOnce(response);

      result.current.sendKernelCommand();
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith(
          JSON.stringify(response),
          'received',
        );
      });
    });

    it('logs error message on failure', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());
      const error = new Error('Test error');

      mockSendMessage.mockRejectedValueOnce(error);

      result.current.sendKernelCommand();
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith(error.message, 'error');
      });
    });
  });

  describe('terminateAllVats', () => {
    it('sends terminate all vats command', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());

      mockSendMessage.mockResolvedValueOnce({ success: true });

      result.current.terminateAllVats();
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'terminateAllVats',
          params: [],
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        'All vats terminated',
        'success',
      );
    });

    it('logs error on failure', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());

      mockSendMessage.mockRejectedValueOnce(new Error());

      result.current.terminateAllVats();
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith(
          'Failed to terminate all vats',
          'error',
        );
      });
    });
  });

  describe('clearState', () => {
    it('sends clear state command', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());

      mockSendMessage.mockResolvedValueOnce({ success: true });

      result.current.clearState();
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'clearState',
          params: [],
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith('State cleared', 'success');
    });

    it('logs error on failure', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());

      mockSendMessage.mockRejectedValueOnce(new Error());

      result.current.clearState();
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith(
          'Failed to clear state',
          'error',
        );
      });
    });
  });

  describe('reload', () => {
    it('sends reload command', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());

      mockSendMessage.mockResolvedValueOnce({ success: true });

      result.current.reload();
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'reload',
          params: [],
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Default sub-cluster reloaded',
        'success',
      );
    });

    it('logs error on failure', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());

      mockSendMessage.mockRejectedValueOnce(new Error());

      result.current.reload();
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith(
          'Failed to reload',
          'error',
        );
      });
    });
  });

  describe('launchVat', () => {
    it('sends launch vat command with correct parameters', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());
      const bundleUrl = 'test-bundle-url';
      const vatName = 'test-vat';

      mockSendMessage.mockResolvedValueOnce({ success: true });

      result.current.launchVat(bundleUrl, vatName);
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'launchVat',
          params: {
            bundleSpec: bundleUrl,
            parameters: {
              name: vatName,
            },
          },
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        `Launched vat "${vatName}"`,
        'success',
      );
    });

    it('logs error on failure', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());
      const bundleUrl = 'test-bundle-url';
      const vatName = 'test-vat';
      mockSendMessage.mockRejectedValueOnce(new Error());
      result.current.launchVat(bundleUrl, vatName);
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith(
          `Failed to launch vat "${vatName}":`,
          'error',
        );
      });
    });
  });

  describe('updateClusterConfig', () => {
    it('sends update cluster config command with correct parameters', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());
      mockSendMessage.mockResolvedValueOnce({ success: true });
      await result.current.updateClusterConfig(clusterConfig);
      expect(mockSendMessage).toHaveBeenCalledWith({
        method: 'updateClusterConfig',
        params: { config: clusterConfig },
      });
      expect(mockLogMessage).toHaveBeenCalledWith('Config updated', 'success');
    });

    it('logs error on failure', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());
      mockSendMessage.mockRejectedValueOnce(new Error());
      await result.current.updateClusterConfig(clusterConfig);
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Failed to update config',
        'error',
      );
    });
  });
});
