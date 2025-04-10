import { describe, it, expect, vi } from 'vitest';

import { terminateAllHandler } from './terminateAll.ts';

describe('terminateAllHandler', () => {
  it('should call terminateAll with the correct arguments', async () => {
    const terminateAll = vi.fn();
    const result = await terminateAllHandler.implementation(
      { terminateAll },
      [],
    );

    expect(result).toBeNull();
    expect(terminateAll).toHaveBeenCalledWith();
  });

  it('should propagate errors from terminateAll', async () => {
    const terminateAll = vi
      .fn()
      .mockRejectedValueOnce(new Error('Terminate all failed'));
    await expect(
      terminateAllHandler.implementation({ terminateAll }, []),
    ).rejects.toThrow('Terminate all failed');
  });
});
