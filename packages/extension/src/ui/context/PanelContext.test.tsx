import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@ocap/utils', () => ({
  stringify: JSON.stringify,
}));

vi.mock('../services/logger.js', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('../utils.js', () => ({
  isErrorResponse: vi.fn(),
}));

vi.mock('../hooks/useStatusPolling.js', () => ({
  useStatusPolling: vi.fn(),
}));

describe('PanelContext', () => {
  const mockSendMessage = vi.fn();

  describe('sendMessageWrapper', () => {
    it('should log outgoing message and return response on success', async () => {
      const { PanelProvider, usePanelContext } = await import(
        './PanelContext.js'
      );
      const payload = { test: 'data' };
      const response = { success: true };
      mockSendMessage.mockResolvedValueOnce(response);
      vi.mocked(await import('../utils.js')).isErrorResponse.mockReturnValue(
        false,
      );
      const { result } = renderHook(() => usePanelContext(), {
        wrapper: ({ children }) => (
          <PanelProvider sendMessage={mockSendMessage}>
            {children}
          </PanelProvider>
        ),
      });
      // @ts-expect-error - we are testing the sendMessage function
      const actualResponse = await result.current.sendMessage(payload);
      expect(mockSendMessage).toHaveBeenCalledWith(payload);
      expect(actualResponse).toBe(response);
    });

    it('should throw error when response is an error', async () => {
      const { PanelProvider, usePanelContext } = await import(
        './PanelContext.js'
      );
      const payload = { test: 'data' };
      const errorResponse = { error: 'Test error' };
      mockSendMessage.mockResolvedValueOnce(errorResponse);
      vi.mocked(await import('../utils.js')).isErrorResponse.mockReturnValue(
        true,
      );
      const { result } = renderHook(() => usePanelContext(), {
        wrapper: ({ children }) => (
          <PanelProvider sendMessage={mockSendMessage}>
            {children}
          </PanelProvider>
        ),
      });
      // @ts-expect-error - we are testing the sendMessage function
      await expect(result.current.sendMessage(payload)).rejects.toThrow(
        JSON.stringify(errorResponse.error),
      );
      expect(
        vi.mocked(await import('../services/logger.js')).logger.error,
      ).toHaveBeenCalledWith(
        `Error: ${JSON.stringify(errorResponse.error)}`,
        'error',
      );
    });

    it('should handle and log general errors', async () => {
      const { PanelProvider, usePanelContext } = await import(
        './PanelContext.js'
      );
      const payload = { test: 'data' };
      const error = new Error('Network error');
      mockSendMessage.mockRejectedValueOnce(error);
      const { result } = renderHook(() => usePanelContext(), {
        wrapper: ({ children }) => (
          <PanelProvider sendMessage={mockSendMessage}>
            {children}
          </PanelProvider>
        ),
      });
      // @ts-expect-error - we are testing the sendMessage function
      await expect(result.current.sendMessage(payload)).rejects.toThrow(error);
      expect(
        vi.mocked(await import('../services/logger.js')).logger.error,
      ).toHaveBeenCalledWith(`Error: ${error.message}`, 'error');
    });
  });

  describe('clearLogs', () => {
    it('should clear all panel logs', async () => {
      const { PanelProvider, usePanelContext } = await import(
        './PanelContext.js'
      );
      const { result } = renderHook(() => usePanelContext(), {
        wrapper: ({ children }) => (
          <PanelProvider sendMessage={mockSendMessage}>
            {children}
          </PanelProvider>
        ),
      });
      result.current.logMessage('test message');
      await waitFor(() => {
        expect(result.current.panelLogs).toHaveLength(1);
      });
      result.current.clearLogs();
      await waitFor(() => {
        expect(result.current.panelLogs).toHaveLength(0);
      });
    });
  });
});
