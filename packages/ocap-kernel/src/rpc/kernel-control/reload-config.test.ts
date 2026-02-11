import { describe, it, expect, vi, beforeEach } from 'vitest';

import { reloadConfigHandler } from './reload-config.ts';
import type { Kernel } from '../../Kernel.ts';

describe('reloadConfigHandler', () => {
  let mockKernel: Kernel;
  beforeEach(() => {
    mockKernel = {
      reload: vi.fn().mockResolvedValue(undefined),
    } as unknown as Kernel;
  });

  it('should call kernel.reload() and return null', async () => {
    const result = await reloadConfigHandler.implementation(
      { kernel: mockKernel },
      [],
    );

    expect(mockKernel.reload).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('should propagate errors from kernel.reload()', async () => {
    const error = new Error('Reload failed');
    vi.mocked(mockKernel.reload).mockRejectedValueOnce(error);

    await expect(
      reloadConfigHandler.implementation({ kernel: mockKernel }, []),
    ).rejects.toThrow(error);
  });
});
