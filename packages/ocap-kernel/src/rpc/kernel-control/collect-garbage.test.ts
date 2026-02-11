import { describe, it, expect, vi, beforeEach } from 'vitest';

import { collectGarbageHandler } from './collect-garbage.ts';
import type { Kernel } from '../../Kernel.ts';

describe('collectGarbageHandler', () => {
  let mockKernel: Kernel;

  beforeEach(() => {
    mockKernel = {
      collectGarbage: vi.fn(),
    } as unknown as Kernel;
  });

  it('collects garbage', () => {
    const result = collectGarbageHandler.implementation(
      { kernel: mockKernel },
      [],
    );

    expect(mockKernel.collectGarbage).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('should propagate errors from collectGarbage', async () => {
    const error = new Error('Collect garbage failed');
    vi.mocked(mockKernel.collectGarbage).mockImplementationOnce(() => {
      throw error;
    });
    expect(() =>
      collectGarbageHandler.implementation({ kernel: mockKernel }, []),
    ).toThrow(error);
  });
});
