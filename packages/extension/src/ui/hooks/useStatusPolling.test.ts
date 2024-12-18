import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  const mockSetStatus = vi.fn();
  const mockSendMessage = vi.fn();
  const mockInterval = 100;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should not fetch status when sendMessage is undefined', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.js');
    renderHook(() => useStatusPolling(mockSetStatus, undefined, mockInterval));
    vi.advanceTimersByTime(mockInterval);
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('should start polling and fetch initial status', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.js');
    const mockStatus = { vats: [] };
    mockSendMessage.mockResolvedValueOnce(mockStatus);
    vi.mocked(await import('../utils.js')).isErrorResponse.mockReturnValue(
      false,
    );
    renderHook(() => useStatusPolling(mockSetStatus, mockSendMessage, 100));
    expect(mockSendMessage).toHaveBeenCalledWith({
      method: 'getStatus',
      params: null,
    });
  });

  it('should handle error responses', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.js');
    const errorResponse = { error: 'Test error' };
    mockSendMessage.mockResolvedValueOnce(errorResponse);
    vi.mocked(await import('../utils.js')).isErrorResponse.mockReturnValue(
      true,
    );
    renderHook(() =>
      useStatusPolling(mockSetStatus, mockSendMessage, mockInterval),
    );
    expect(mockSendMessage).toHaveBeenCalledWith({
      method: 'getStatus',
      params: null,
    });
    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(
      vi.mocked(await import('../services/logger.js')).logger.error,
    ).toHaveBeenCalledWith('Failed to fetch status:', new Error('Test error'));
  });

  it('should handle fetch errors', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.js');
    const error = new Error('Network error');
    mockSendMessage.mockRejectedValueOnce(error);
    renderHook(() =>
      useStatusPolling(mockSetStatus, mockSendMessage, mockInterval),
    );
    expect(mockSendMessage).toHaveBeenCalledWith({
      method: 'getStatus',
      params: null,
    });
    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(
      vi.mocked(await import('../services/logger.js')).logger.error,
    ).toHaveBeenCalledWith('Failed to fetch status:', error);
  });

  it('should poll at specified intervals', async () => {
    const { useStatusPolling } = await import('./useStatusPolling.js');
    const mockStatus = { vats: [] };
    mockSendMessage.mockResolvedValue(mockStatus);
    vi.mocked(await import('../utils.js')).isErrorResponse.mockReturnValue(
      false,
    );
    renderHook(() =>
      useStatusPolling(mockSetStatus, mockSendMessage, mockInterval),
    );
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
      useStatusPolling(mockSetStatus, mockSendMessage, mockInterval),
    );
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(mockInterval * 2);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});
