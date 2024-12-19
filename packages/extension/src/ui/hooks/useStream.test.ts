import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { useStream } from './useStream.js';
import { setupStream } from '../services/stream.js';

vi.mock('../services/stream.js', () => ({
  setupStream: vi.fn(),
}));

describe('useStream', () => {
  const mockSendMessage = vi.fn();

  it('should set sendMessage function when stream setup succeeds', async () => {
    vi.mocked(setupStream).mockResolvedValueOnce({
      sendMessage: mockSendMessage,
    });
    const { result } = renderHook(() => useStream());
    await waitFor(() => {
      expect(result.current.sendMessage).toBeDefined();
    });
    expect(result.current).toStrictEqual({
      sendMessage: mockSendMessage,
    });
    expect(setupStream).toHaveBeenCalledTimes(1);
  });

  it('should set error state when stream setup fails', async () => {
    const mockError = new Error('Stream setup failed');
    vi.mocked(setupStream).mockRejectedValueOnce(mockError);
    const { result } = renderHook(() => useStream());
    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
    expect(result.current).toStrictEqual({
      error: mockError,
    });
    expect(setupStream).toHaveBeenCalledTimes(1);
  });
});
