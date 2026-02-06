import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useEvaluate } from './useEvaluate.ts';
import { usePanelContext } from '../context/PanelContext.tsx';

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

describe('useEvaluate', () => {
  const mockCallKernelMethod = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePanelContext).mockReturnValue({
      callKernelMethod: mockCallKernelMethod,
    } as unknown as ReturnType<typeof usePanelContext>);
  });

  describe('hook interface', () => {
    it('returns the expected methods', () => {
      const { result } = renderHook(() => useEvaluate());
      expect(result.current).toStrictEqual({
        evaluateVat: expect.any(Function),
      });
    });
  });

  describe('evaluateVat', () => {
    it('calls the correct kernel method', async () => {
      const mockResult = { success: true, value: 2 };
      mockCallKernelMethod.mockResolvedValueOnce(mockResult);

      const { result } = renderHook(() => useEvaluate());
      const evalResult = await result.current.evaluateVat('v1', '1 + 1');

      expect(mockCallKernelMethod).toHaveBeenCalledWith({
        method: 'evaluateVat',
        params: { id: 'v1', code: '1 + 1' },
      });
      expect(evalResult).toStrictEqual(mockResult);
    });

    it('propagates errors from callKernelMethod', async () => {
      const error = new Error('Evaluation failed');
      mockCallKernelMethod.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useEvaluate());
      await expect(
        result.current.evaluateVat('v1', 'bad code'),
      ).rejects.toThrow('Evaluation failed');
    });
  });
});
