import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getStatusHandler } from './get-status.ts';
import type { Kernel } from '../../Kernel.ts';

describe('getStatusHandler', () => {
  let mockKernel: Kernel;

  beforeEach(() => {
    mockKernel = {
      getStatus: vi.fn(),
    } as unknown as Kernel;
  });

  it('should return vats and subclusters status', async () => {
    const mockVats = [
      { id: 'v1', config: { sourceSpec: 'test' }, subclusterId: 'sc1' },
    ];
    const mockSubclusters = [
      { id: 'sc1', config: { bootstrap: 'test', vats: {} }, vats: [] },
    ];

    vi.mocked(mockKernel.getStatus).mockResolvedValueOnce({
      vats: mockVats,
      subclusters: mockSubclusters,
    });

    const result = await getStatusHandler.implementation(
      { kernel: mockKernel },
      [],
    );

    expect(mockKernel.getStatus).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({
      vats: mockVats,
      subclusters: mockSubclusters,
    });
  });

  it('should propagate errors from getVats', async () => {
    const error = new Error('Status check failed');
    vi.mocked(mockKernel.getStatus).mockRejectedValueOnce(error);
    await expect(
      getStatusHandler.implementation({ kernel: mockKernel }, []),
    ).rejects.toThrow(error);
  });

  it('should propagate errors from getSubclusters', async () => {
    const error = new Error('Subcluster status check failed');
    vi.mocked(mockKernel.getStatus).mockRejectedValueOnce(error);
    await expect(
      getStatusHandler.implementation({ kernel: mockKernel }, []),
    ).rejects.toThrow(error);
  });
});
