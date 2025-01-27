import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import clusterConfig from '../../vats/default-cluster.json';

vi.mock('../../kernel-integration/messages.js', () => ({
  KernelControlMethod: {
    getStatus: 'getStatus',
  },
}));

vi.mock('../services/logger.js', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('../utils.js', () => ({
  isErrorResponse: vi.fn(),
}));

describe('useStatusPolling', () => {
  const mockSendMessage = vi.fn();
  const mockInterval = 100;

  it('should start polling and fetch initial status', async () => {
    const mockStatus = { vats: [], clusterConfig };
    mockSendMessage.mockResolvedValueOnce(mockStatus);
    vi.mocked(await import('../utils.js')).isErrorResponse.mockReturnValue(
      false,
    );
    const { useStatusPolling } = await import('./useStatusPolling.js');
    const { result } = renderHook(() => useStatusPolling(mockSendMessage, 100));
    expect(mockSendMessage).toHaveBeenCalledWith({
      method: 'getStatus',
      params: null,
    });
    await waitFor(() => expect(result.current).toStrictEqual(mockStatus));
  });

  it('should handle error responses', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.js');
    const errorResponse = { error: 'Test error' };
    mockSendMessage.mockResolvedValueOnce(errorResponse);
    vi.mocked(await import('../utils.js')).isErrorResponse.mockReturnValue(
      true,
    );
    renderHook(() => useStatusPolling(mockSendMessage, mockInterval));
    expect(mockSendMessage).toHaveBeenCalledWith({
      method: 'getStatus',
      params: null,
    });
    expect(
      vi.mocked(await import('../services/logger.js')).logger.error,
    ).toHaveBeenCalledWith('Failed to fetch status:', new Error('Test error'));
  });

  it('should handle fetch errors', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.js');
    const error = new Error('Network error');
    mockSendMessage.mockRejectedValueOnce(error);
    renderHook(() => useStatusPolling(mockSendMessage, mockInterval));
    expect(mockSendMessage).toHaveBeenCalledWith({
      method: 'getStatus',
      params: null,
    });
    expect(
      vi.mocked(await import('../services/logger.js')).logger.error,
    ).toHaveBeenCalledWith('Failed to fetch status:', error);
  });

  describe('polling', () => {
    beforeEach(() => {
      vi.useFakeTimers({
        now: Date.now(),
        toFake: ['setInterval', 'clearInterval'],
      });
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it('should poll at specified intervals', async () => {
      const { useStatusPolling } = await import('./useStatusPolling.js');
      const mockStatus = { vats: [], clusterConfig };
      mockSendMessage.mockResolvedValue(mockStatus);
      vi.mocked(await import('../utils.js')).isErrorResponse.mockReturnValue(
        false,
      );
      renderHook(() => useStatusPolling(mockSendMessage, mockInterval));
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(mockInterval);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(mockInterval);
      expect(mockSendMessage).toHaveBeenCalledTimes(3);
    });

    it('should cleanup interval on unmount', async () => {
      const { useStatusPolling } = await import('./useStatusPolling.js');
      const mockStatus = { vats: [] };
      mockSendMessage.mockResolvedValue(mockStatus);
      vi.mocked(await import('../utils.js')).isErrorResponse.mockReturnValue(
        false,
      );
      const { unmount } = renderHook(() =>
        useStatusPolling(mockSendMessage, mockInterval),
      );
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      unmount();
      vi.advanceTimersByTime(mockInterval * 2);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
