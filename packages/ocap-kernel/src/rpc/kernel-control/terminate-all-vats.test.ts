import { describe, it, expect, vi, beforeEach } from 'vitest';

import { terminateAllVatsHandler } from './terminate-all-vats.ts';
import type { Kernel } from '../../Kernel.ts';

describe('terminateAllVatsHandler', () => {
  let mockKernel: Kernel;
  beforeEach(() => {
    mockKernel = {
      terminateAllVats: vi.fn(),
    } as unknown as Kernel;
  });

  it('terminates all vats', async () => {
    vi.mocked(mockKernel.terminateAllVats).mockResolvedValueOnce(undefined);

    const result = await terminateAllVatsHandler.implementation(
      { kernel: mockKernel },
      [],
    );

    expect(mockKernel.terminateAllVats).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.terminateAllVats', async () => {
    const error = new Error('Termination failed');
    vi.mocked(mockKernel.terminateAllVats).mockRejectedValueOnce(error);
    await expect(
      terminateAllVatsHandler.implementation({ kernel: mockKernel }, []),
    ).rejects.toThrow(error);
  });
});
