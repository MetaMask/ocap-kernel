import type { VatConfig } from '@ocap/kernel';
import { setupOcapKernelMock } from '@ocap/test-utils';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { PanelContextType } from '../context/PanelContext.tsx';

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

setupOcapKernelMock();

vi.mock('@ocap/utils', async (importOriginal) => ({
  ...(await importOriginal()),
  stringify: JSON.stringify,
}));

describe('useVats', () => {
  const mockSendMessage = vi.fn();
  const mockLogMessage = vi.fn();
  const mockSetSelectedVatId = vi.fn();
  const mockVatId = 'vat1';

  const mockStatus = {
    vats: [
      {
        id: mockVatId,
        config: {
          bundleSpec: 'test-bundle',
          parameters: { foo: 'bar' },
          creationOptions: { test: true },
        },
      },
    ],
  };

  beforeEach(async () => {
    const { usePanelContext } = await import('../context/PanelContext.tsx');
    vi.mocked(usePanelContext).mockReturnValue({
      callKernelMethod: mockSendMessage,
      status: mockStatus,
      selectedVatId: mockVatId,
      setSelectedVatId: mockSetSelectedVatId,
      logMessage: mockLogMessage,
    } as unknown as PanelContextType);
  });

  it('should return vats data from status', async () => {
    const { useVats } = await import('./useVats.ts');
    const { result } = renderHook(() => useVats());

    expect(result.current.vats).toStrictEqual([
      {
        id: mockVatId,
        source: 'test-bundle',
        parameters: '{"foo":"bar"}',
        creationOptions: '{"test":true}',
      },
    ]);
  });

  it('should handle missing vat config gracefully', async () => {
    const { usePanelContext } = await import('../context/PanelContext.tsx');
    vi.mocked(usePanelContext).mockReturnValue({
      callKernelMethod: mockSendMessage,
      status: { vats: [{ id: mockVatId, config: {} as VatConfig }] },
      selectedVatId: mockVatId,
      setSelectedVatId: mockSetSelectedVatId,
      logMessage: mockLogMessage,
    } as unknown as PanelContextType);

    const { useVats } = await import('./useVats.ts');
    const { result } = renderHook(() => useVats());

    expect(result.current.vats).toStrictEqual([
      {
        id: mockVatId,
        source: 'unknown',
        parameters: '{}',
        creationOptions: '{}',
      },
    ]);
  });

  describe('pingVat', () => {
    it('should send ping message and log success', async () => {
      const { useVats } = await import('./useVats.ts');
      const { result } = renderHook(() => useVats());

      mockSendMessage.mockResolvedValueOnce({ success: true });
      result.current.pingVat(mockVatId);
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'sendVatCommand',
          params: {
            id: mockVatId,
            payload: {
              id: expect.any(String),
              jsonrpc: '2.0',
              method: 'ping',
              params: [],
            },
          },
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        '{"success":true}',
        'received',
      );
    });

    it('should handle ping error', async () => {
      const { useVats } = await import('./useVats.ts');
      const { result } = renderHook(() => useVats());

      const error = new Error('Ping failed');
      mockSendMessage.mockRejectedValueOnce(error);
      result.current.pingVat(mockVatId);
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith('Ping failed', 'error');
      });
    });
  });

  describe('restartVat', () => {
    it('should send restart message and log success', async () => {
      const { useVats } = await import('./useVats.ts');
      const { result } = renderHook(() => useVats());

      mockSendMessage.mockResolvedValueOnce(undefined);
      result.current.restartVat(mockVatId);
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'restartVat',
          params: { id: mockVatId },
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Restarted vat "vat1"',
        'success',
      );
    });

    it('should handle restart error', async () => {
      const { useVats } = await import('./useVats.ts');
      const { result } = renderHook(() => useVats());

      mockSendMessage.mockRejectedValueOnce(new Error());
      result.current.restartVat(mockVatId);
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith(
          'Failed to restart vat "vat1"',
          'error',
        );
      });
    });
  });

  describe('terminateVat', () => {
    it('should send terminate message and log success', async () => {
      const { useVats } = await import('./useVats.ts');
      const { result } = renderHook(() => useVats());

      mockSendMessage.mockResolvedValueOnce(undefined);
      result.current.terminateVat(mockVatId);
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          method: 'terminateVat',
          params: { id: mockVatId },
        });
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Terminated vat "vat1"',
        'success',
      );
    });

    it('should handle terminate error', async () => {
      const { useVats } = await import('./useVats.ts');
      const { result } = renderHook(() => useVats());
      mockSendMessage.mockRejectedValueOnce(new Error());
      result.current.terminateVat(mockVatId);
      await waitFor(() => {
        expect(mockLogMessage).toHaveBeenCalledWith(
          'Failed to terminate vat "vat1"',
          'error',
        );
      });
    });
  });
});
