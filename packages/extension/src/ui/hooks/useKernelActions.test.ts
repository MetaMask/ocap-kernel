import clusterConfig from '@metamask/kernel-browser-runtime/default-cluster' assert { type: 'json' };
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

vi.mock('@metamask/kernel-utils', async (importOriginal) => ({
  ...(await importOriginal()),
  stringify: JSON.stringify,
}));

describe('useKernelActions', () => {
  const mockSendMessage = vi.fn();
  const mockLogMessage = vi.fn();
  const mockMessageContent = '{"id": "v0", "payload": {"method": "test"}}';

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
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
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

  describe('collectGarbage', () => {
    it('sends collect garbage command', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());

      mockSendMessage.mockResolvedValueOnce({ success: true });

      result.current.collectGarbage();
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'collectGarbage',
          params: [],
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Garbage collected',
        'success',
      );
    });

    it('logs error on failure', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());

      mockSendMessage.mockRejectedValueOnce(new Error());

      result.current.collectGarbage();
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith(
          'Failed to collect garbage',
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
      expect(mockLogMessage).toHaveBeenCalledWith('Kernel reloaded', 'success');
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

  describe('launchSubcluster', () => {
    it('sends launch subcluster command with correct parameters', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());
      mockSendMessage.mockResolvedValueOnce({ success: true });
      result.current.launchSubcluster(clusterConfig);
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'launchSubcluster',
          params: { config: clusterConfig },
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Subcluster launched',
        'success',
      );
    });

    it('logs error on failure', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());
      const error = new Error('Failed to launch subcluster');
      mockSendMessage.mockRejectedValueOnce(error);
      result.current.launchSubcluster(clusterConfig);
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith(
          'Failed to launch subcluster: Failed to launch subcluster',
          'error',
        );
      });
    });
  });

  describe('revoke', () => {
    it('sends revoke command with correct parameters', async () => {
      const { useKernelActions } = await import('./useKernelActions.ts');
      const { result } = renderHook(() => useKernelActions());
      mockSendMessage.mockResolvedValueOnce({ success: true });
      result.current.revoke('test');
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'revoke',
          params: { kref: 'test' },
        });
      });
    });
  });
});
