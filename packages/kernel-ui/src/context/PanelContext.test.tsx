import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@metamask/kernel-utils', () => ({
  stringify: JSON.stringify,
}));

vi.mock('../services/logger.ts', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@metamask/utils', () => ({
  isJsonRpcFailure: vi.fn(),
}));

vi.mock('../hooks/useStatusPolling.ts', () => ({
  useStatusPolling: vi.fn(),
}));

describe('PanelContext', () => {
  const mockSendMessage = vi.fn();

  describe('sendMessageWrapper', () => {
    it('should log outgoing message and return response on success', async () => {
      const { PanelProvider, usePanelContext } = await import(
        './PanelContext.tsx'
      );
      const response = { success: true };
      mockSendMessage.mockResolvedValueOnce(response);
      vi.mocked(
        await import('@metamask/utils'),
      ).isJsonRpcFailure.mockReturnValue(false);
      const { result } = renderHook(() => usePanelContext(), {
        wrapper: ({ children }) => (
          <PanelProvider callKernelMethod={mockSendMessage}>
            {children}
          </PanelProvider>
        ),
      });
      const actualResponse = await result.current.callKernelMethod({
        method: 'getStatus',
        params: [],
      });
      expect(actualResponse).toBe(response);
    });

    it('should queue requests when one is already in progress', async () => {
      const { PanelProvider, usePanelContext } = await import(
        './PanelContext.tsx'
      );
      let firstRequestResolve: (() => void) | undefined;
      const firstRequestPromise = new Promise<void>((resolve) => {
        firstRequestResolve = resolve;
      });
      const secondResponse = { success: true, second: true };
      mockSendMessage
        .mockImplementationOnce(async () => firstRequestPromise)
        .mockResolvedValueOnce(secondResponse);
      vi.mocked(
        await import('@metamask/utils'),
      ).isJsonRpcFailure.mockReturnValue(false);
      const { result } = renderHook(() => usePanelContext(), {
        wrapper: ({ children }) => (
          <PanelProvider callKernelMethod={mockSendMessage}>
            {children}
          </PanelProvider>
        ),
      });
      const firstRequest = result.current.callKernelMethod({
        method: 'getStatus',
        params: [],
      });
      const secondRequest = result.current.callKernelMethod({
        method: 'getStatus',
        params: [],
      });
      firstRequestResolve?.();
      await firstRequest;
      const actualSecondResponse = await secondRequest;
      expect(actualSecondResponse).toBe(secondResponse);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple concurrent requests without race conditions', async () => {
      const { PanelProvider, usePanelContext } = await import(
        './PanelContext.tsx'
      );
      const responses = [
        { success: true, id: 1 },
        { success: true, id: 2 },
        { success: true, id: 3 },
        { success: true, id: 4 },
        { success: true, id: 5 },
      ];
      mockSendMessage
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
        .mockResolvedValueOnce(responses[2])
        .mockResolvedValueOnce(responses[3])
        .mockResolvedValueOnce(responses[4]);
      vi.mocked(
        await import('@metamask/utils'),
      ).isJsonRpcFailure.mockReturnValue(false);

      const { result } = renderHook(() => usePanelContext(), {
        wrapper: ({ children }) => (
          <PanelProvider callKernelMethod={mockSendMessage}>
            {children}
          </PanelProvider>
        ),
      });
      const requests = responses.map(async (_, index) =>
        result.current.callKernelMethod({
          method: 'getStatus',
          params: [index],
        }),
      );
      const results = await Promise.all(requests);
      results.forEach((response, index) => {
        expect(response).toBe(responses[index]);
      });
      expect(mockSendMessage).toHaveBeenCalledTimes(5);
    });

    it('should throw error when response is an error', async () => {
      const { PanelProvider, usePanelContext } = await import(
        './PanelContext.tsx'
      );
      const errorResponse = { error: 'Test error' };
      mockSendMessage.mockResolvedValueOnce(errorResponse);
      vi.mocked(
        await import('@metamask/utils'),
      ).isJsonRpcFailure.mockReturnValue(true);
      const { result } = renderHook(() => usePanelContext(), {
        wrapper: ({ children }) => (
          <PanelProvider callKernelMethod={mockSendMessage}>
            {children}
          </PanelProvider>
        ),
      });
      await expect(
        result.current.callKernelMethod({
          method: 'getStatus',
          params: [],
        }),
      ).rejects.toThrow(JSON.stringify(errorResponse.error));
      expect(
        vi.mocked(await import('../services/logger.ts')).logger.error,
      ).toHaveBeenCalledWith(
        `Error: ${JSON.stringify(errorResponse.error)}`,
        'error',
      );
    });

    it('should handle and log general errors', async () => {
      const { PanelProvider, usePanelContext } = await import(
        './PanelContext.tsx'
      );
      const error = new Error('Network error');
      mockSendMessage.mockRejectedValueOnce(error);
      const { result } = renderHook(() => usePanelContext(), {
        wrapper: ({ children }) => (
          <PanelProvider callKernelMethod={mockSendMessage}>
            {children}
          </PanelProvider>
        ),
      });
      await expect(
        result.current.callKernelMethod({
          method: 'getStatus',
          params: [],
        }),
      ).rejects.toThrow(error);
      expect(
        vi.mocked(await import('../services/logger.ts')).logger.error,
      ).toHaveBeenCalledWith(`Error: ${error.message}`, 'error');
    });
  });

  describe('clearLogs', () => {
    it('should clear all panel logs', async () => {
      const { PanelProvider, usePanelContext } = await import(
        './PanelContext.tsx'
      );
      const { result } = renderHook(() => usePanelContext(), {
        wrapper: ({ children }) => (
          <PanelProvider callKernelMethod={mockSendMessage}>
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

  describe('usePanelContext', () => {
    it('should throw error when used outside of PanelProvider', async () => {
      const { usePanelContext } = await import('./PanelContext.tsx');
      const { result } = renderHook(() => usePanelContext());
      expect(result.error).toStrictEqual(
        new Error('usePanelContext must be used within a PanelProvider'),
      );
    });
  });
});
