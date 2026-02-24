import { describe, it, expect, vi, beforeEach } from 'vitest';

import { registerLocationHintsHandler } from './register-location-hints.ts';
import type { Kernel } from '../../Kernel.ts';

describe('registerLocationHintsHandler', () => {
  let mockKernel: Kernel;

  beforeEach(() => {
    mockKernel = {
      registerLocationHints: vi.fn().mockResolvedValue(undefined),
    } as unknown as Kernel;
  });

  it('calls registerLocationHints and returns null', async () => {
    const params = {
      peerId: 'peer-123',
      hints: ['/ip4/192.168.1.1/udp/4001/quic-v1'],
    };

    const result = await registerLocationHintsHandler.implementation(
      { kernel: mockKernel },
      params,
    );

    expect(mockKernel.registerLocationHints).toHaveBeenCalledWith('peer-123', [
      '/ip4/192.168.1.1/udp/4001/quic-v1',
    ]);
    expect(result).toBeNull();
  });

  it('passes multiple hints', async () => {
    const params = {
      peerId: 'peer-456',
      hints: ['/ip4/10.0.0.1/udp/4001/quic-v1', '/ip4/10.0.0.1/tcp/4001'],
    };

    const result = await registerLocationHintsHandler.implementation(
      { kernel: mockKernel },
      params,
    );

    expect(mockKernel.registerLocationHints).toHaveBeenCalledWith('peer-456', [
      '/ip4/10.0.0.1/udp/4001/quic-v1',
      '/ip4/10.0.0.1/tcp/4001',
    ]);
    expect(result).toBeNull();
  });

  it('propagates errors from kernel.registerLocationHints', async () => {
    const error = new Error('Failed to register hints');
    vi.mocked(mockKernel.registerLocationHints).mockRejectedValueOnce(error);

    await expect(
      registerLocationHintsHandler.implementation(
        { kernel: mockKernel },
        { peerId: 'peer-123', hints: ['hint1'] },
      ),
    ).rejects.toThrow(error);
  });
});
