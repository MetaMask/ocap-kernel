import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../context/PanelContext.js', () => ({
  usePanelContext: vi.fn(),
}));

vi.mock('../../kernel-integration/messages.js', () => ({
  KernelControlMethod: {
    sendMessage: 'sendMessage',
    terminateAllVats: 'terminateAllVats',
    clearState: 'clearState',
    launchVat: 'launchVat',
  },
}));

vi.mock('@ocap/utils', () => ({
  stringify: JSON.stringify,
}));

describe('useKernelActions', () => {
  const mockSendMessage = vi.fn();
  const mockLogMessage = vi.fn();
  const mockMessageContent = '{"test": "content"}';
  const mockSelectedVatId = 'v1';

  beforeEach(async () => {
    vi.clearAllMocks();
    const { usePanelContext } = await import('../context/PanelContext.js');
    vi.mocked(usePanelContext).mockReturnValue({
      sendMessage: mockSendMessage,
      logMessage: mockLogMessage,
      messageContent: mockMessageContent,
      selectedVatId: mockSelectedVatId,
      setMessageContent: vi.fn(),
      status: null,
      setStatus: vi.fn(),
      panelLogs: [],
      setSelectedVatId: vi.fn(),
      clearLogs: vi.fn(),
    });
  });

  describe('sendKernelCommand', () => {
    it('sends message with payload and selected vat ID', async () => {
      const { useKernelActions } = await import('./useKernelActions.js');
      const { result } = renderHook(() => useKernelActions());
      const expectedPayload = { test: 'content' };

      mockSendMessage.mockResolvedValueOnce({ success: true });

      result.current.sendKernelCommand();
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'sendMessage',
          params: {
            payload: expectedPayload,
            id: mockSelectedVatId,
          },
        });
      });
    });

    it('sends message without vat ID when none selected', async () => {
      const { usePanelContext } = await import('../context/PanelContext.js');
      vi.mocked(usePanelContext).mockReturnValue({
        sendMessage: mockSendMessage,
        logMessage: mockLogMessage,
        messageContent: mockMessageContent,
        selectedVatId: undefined,
        setMessageContent: vi.fn(),
        status: null,
        setStatus: vi.fn(),
        panelLogs: [],
        setSelectedVatId: vi.fn(),
        clearLogs: vi.fn(),
      });
      const { useKernelActions } = await import('./useKernelActions.js');
      const { result } = renderHook(() => useKernelActions());
      const expectedPayload = { test: 'content' };

      mockSendMessage.mockResolvedValueOnce({ success: true });

      result.current.sendKernelCommand();
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'sendMessage',
          params: {
            payload: expectedPayload,
          },
        });
      });
    });

    it('logs success response', async () => {
      const { useKernelActions } = await import('./useKernelActions.js');
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
      const { useKernelActions } = await import('./useKernelActions.js');
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
      const { useKernelActions } = await import('./useKernelActions.js');
      const { result } = renderHook(() => useKernelActions());

      mockSendMessage.mockResolvedValueOnce({ success: true });

      result.current.terminateAllVats();
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'terminateAllVats',
          params: null,
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        'All vats terminated',
        'success',
      );
    });

    it('logs error on failure', async () => {
      const { useKernelActions } = await import('./useKernelActions.js');
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
      const { useKernelActions } = await import('./useKernelActions.js');
      const { result } = renderHook(() => useKernelActions());

      mockSendMessage.mockResolvedValueOnce({ success: true });

      result.current.clearState();
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'clearState',
          params: null,
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith('State cleared', 'success');
    });

    it('logs error on failure', async () => {
      const { useKernelActions } = await import('./useKernelActions.js');
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

  describe('launchVat', () => {
    it('sends launch vat command with correct parameters', async () => {
      const { useKernelActions } = await import('./useKernelActions.js');
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
      const { useKernelActions } = await import('./useKernelActions.js');
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
});
