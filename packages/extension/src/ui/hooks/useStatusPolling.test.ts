import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import clusterConfig from '../../vats/default-cluster.json';

vi.mock('../services/logger.ts', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('useStatusPolling', () => {
  const mockSendMessage = vi.fn();
  const mockInterval = 100;
  const mockIsRequestInProgress = { current: false };

  beforeEach(() => {
    mockIsRequestInProgress.current = false;
  });

  it('should start polling and fetch initial status', async () => {
    const mockStatus = { vats: [], clusterConfig };
    mockSendMessage.mockResolvedValueOnce(mockStatus);
    const { useStatusPolling } = await import('./useStatusPolling.ts');
    const { result } = renderHook(() =>
      useStatusPolling(mockSendMessage, mockIsRequestInProgress, mockInterval),
    );
    expect(mockSendMessage).toHaveBeenCalledWith({
      method: 'getStatus',
      params: [],
    });
    await waitFor(() => expect(result.current).toStrictEqual(mockStatus));
  });

  it('should handle error responses', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.ts');
    const errorResponse = { error: 'Test error' };
    mockSendMessage.mockResolvedValueOnce(errorResponse);
    renderHook(() =>
      useStatusPolling(mockSendMessage, mockIsRequestInProgress, mockInterval),
    );
    expect(mockSendMessage).toHaveBeenCalledWith({
      method: 'getStatus',
      params: [],
    });
    expect(
      vi.mocked(await import('../services/logger.ts')).logger.error,
    ).toHaveBeenCalledWith(
      'Failed to fetch status:',
      new Error('"Test error"'),
    );
  });

  it('should handle fetch errors', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.ts');
    const error = new Error('Network error');
    mockSendMessage.mockRejectedValueOnce(error);
    renderHook(() =>
      useStatusPolling(mockSendMessage, mockIsRequestInProgress, mockInterval),
    );
    expect(mockSendMessage).toHaveBeenCalledWith({
      method: 'getStatus',
      params: [],
    });
    expect(
      vi.mocked(await import('../services/logger.ts')).logger.error,
    ).toHaveBeenCalledWith('Failed to fetch status:', error);
  });

  it('should not fetch status when request is in progress', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.ts');
    mockIsRequestInProgress.current = true;
    renderHook(() =>
      useStatusPolling(mockSendMessage, mockIsRequestInProgress, mockInterval),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
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
      const { useStatusPolling } = await import('./useStatusPolling.ts');
      const mockStatus = { vats: [], clusterConfig };
      mockSendMessage.mockResolvedValue(mockStatus);
      renderHook(() =>
        useStatusPolling(
          mockSendMessage,
          mockIsRequestInProgress,
          mockInterval,
        ),
      );
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(mockInterval);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(mockInterval);
      expect(mockSendMessage).toHaveBeenCalledTimes(3);
    });

    it('should cleanup interval on unmount', async () => {
      const { useStatusPolling } = await import('./useStatusPolling.ts');
      const mockStatus = { vats: [] };
      mockSendMessage.mockResolvedValue(mockStatus);
      const { unmount } = renderHook(() =>
        useStatusPolling(
          mockSendMessage,
          mockIsRequestInProgress,
          mockInterval,
        ),
      );
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      unmount();
      vi.advanceTimersByTime(mockInterval * 2);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
