import { waitFor, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/logger.ts', () => ({
  logger: {
    error: vi.fn(),
  },
}));

const clusterConfig = {
  bootstrap: 'alice',
  forceReset: true,
  services: [],
  vats: {
    alice: { bundleSpec: 'sample-vat.bundle', parameters: { name: 'Alice' } },
  },
};

describe('useStatusPolling', () => {
  const mockSendMessage = vi.fn();
  const mockInterval = 100;
  const mockIsRequestInProgress = { current: false };

  beforeEach(() => {
    mockIsRequestInProgress.current = false;
    // Queued `...Once` implementations otherwise survive into the next test and
    // answer its first poll, which decides what this hook reports.
    mockSendMessage.mockReset();
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
    await waitFor(() =>
      expect(result.current).toStrictEqual({
        status: mockStatus,
        isUnreachable: false,
      }),
    );
  });

  it('should use default interval when no interval is provided', async () => {
    const mockStatus = { vats: [], clusterConfig };
    mockSendMessage.mockResolvedValue(mockStatus);
    const { useStatusPolling } = await import('./useStatusPolling.ts');

    // Use fake timers to test the default interval
    vi.useFakeTimers({
      now: Date.now(),
      toFake: ['setInterval', 'clearInterval'],
    });

    renderHook(() =>
      useStatusPolling(mockSendMessage, mockIsRequestInProgress),
    );

    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // Advance time by the default interval (1000ms)
    vi.advanceTimersByTime(1000);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
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

  it('reports the kernel unreachable while keeping the last known status', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.ts');
    const mockStatus = { vats: [], clusterConfig };
    mockSendMessage
      .mockResolvedValueOnce(mockStatus)
      .mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() =>
      useStatusPolling(mockSendMessage, mockIsRequestInProgress, mockInterval),
    );

    await waitFor(() => expect(result.current.isUnreachable).toBe(true));
    expect(result.current.status).toStrictEqual(mockStatus);
  });

  it('clears unreachable once a poll succeeds again', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.ts');
    const mockStatus = { vats: [], clusterConfig };
    mockSendMessage
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(mockStatus);
    const { result } = renderHook(() =>
      useStatusPolling(mockSendMessage, mockIsRequestInProgress, mockInterval),
    );

    await waitFor(() => expect(result.current.isUnreachable).toBe(true));
    await waitFor(() => expect(result.current.isUnreachable).toBe(false));
    expect(result.current.status).toStrictEqual(mockStatus);
  });

  it('leaves the previous verdict alone when a poll is skipped', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.ts');
    mockIsRequestInProgress.current = true;
    const { result } = renderHook(() =>
      useStatusPolling(mockSendMessage, mockIsRequestInProgress, mockInterval),
    );

    expect(result.current).toStrictEqual({
      status: undefined,
      isUnreachable: false,
    });
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
