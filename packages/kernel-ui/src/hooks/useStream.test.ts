import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import { describe, it, expect, vi } from 'vitest';

import { useStream } from './useStream.ts';
import { setupStream } from '../services/stream.ts';

vi.mock('../services/stream.ts', () => ({
  setupStream: vi.fn(),
}));

describe('useStream', () => {
  const mockSendMessage = vi.fn();

  it('should set callKernelMethod function when stream setup succeeds', async () => {
    vi.mocked(setupStream).mockResolvedValueOnce({
      callKernelMethod: mockSendMessage,
    });
    const { result } = renderHook(() => useStream());
    await waitFor(() => {
      expect(result.current.callKernelMethod).toBeDefined();
    });
    expect(result.current).toStrictEqual({
      callKernelMethod: mockSendMessage,
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
