import type { Kernel } from '@ocap/kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getStatusHandler } from './get-status.ts';

describe('getStatusHandler', () => {
  let mockKernel: Kernel;

  beforeEach(() => {
    mockKernel = {
      getVats: vi.fn(),
      clusterConfig: undefined,
    } as unknown as Kernel;
    Object.defineProperty(mockKernel, 'clusterConfig', {
      get: vi.fn(() => ({ foo: 'bar' })),
    });
  });

  it('should return vats status and cluster config', async () => {
    vi.mocked(mockKernel.getVats).mockReturnValueOnce([]);

    const result = await getStatusHandler.implementation(
      { kernel: mockKernel },
      [],
    );

    expect(mockKernel.getVats).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({ vats: [], clusterConfig: { foo: 'bar' } });
  });

  it('should propagate errors from getVats', async () => {
    const error = new Error('Status check failed');
    vi.mocked(mockKernel.getVats).mockImplementationOnce(() => {
      throw error;
    });
    await expect(
      getStatusHandler.implementation({ kernel: mockKernel }, []),
    ).rejects.toThrow(error);
  });
});
