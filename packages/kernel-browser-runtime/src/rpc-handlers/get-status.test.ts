import type { Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getStatusHandler } from './get-status.ts';

describe('getStatusHandler', () => {
  let mockKernel: Kernel;

  beforeEach(() => {
    mockKernel = {
      getVats: vi.fn(),
      getSubclusters: vi.fn(),
    } as unknown as Kernel;
  });

  it('should return vats and subclusters status', () => {
    const mockVats = [{ id: 'v1', config: { sourceSpec: 'test' } }];
    const mockSubclusters = [
      { id: 'sc1', config: { bootstrap: 'test', vats: {} }, vats: [] },
    ];

    vi.mocked(mockKernel.getVats).mockReturnValueOnce(mockVats);
    vi.mocked(mockKernel.getSubclusters).mockReturnValueOnce(mockSubclusters);

    const result = getStatusHandler.implementation({ kernel: mockKernel }, []);

    expect(mockKernel.getVats).toHaveBeenCalledTimes(1);
    expect(mockKernel.getSubclusters).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({
      vats: mockVats,
      subclusters: mockSubclusters,
    });
  });

  it('should propagate errors from getVats', () => {
    const error = new Error('Status check failed');
    vi.mocked(mockKernel.getVats).mockImplementationOnce(() => {
      throw error;
    });
    expect(() =>
      getStatusHandler.implementation({ kernel: mockKernel }, []),
    ).toThrow(error);
  });

  it('should propagate errors from getSubclusters', () => {
    const error = new Error('Subcluster status check failed');
    vi.mocked(mockKernel.getVats).mockReturnValueOnce([]);
    vi.mocked(mockKernel.getSubclusters).mockImplementationOnce(() => {
      throw error;
    });
    expect(() =>
      getStatusHandler.implementation({ kernel: mockKernel }, []),
    ).toThrow(error);
  });
});
