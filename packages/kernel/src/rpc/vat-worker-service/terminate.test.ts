import { describe, it, expect, vi } from 'vitest';

import { terminateHandler } from './terminate.ts';

describe('terminateHandler', () => {
  it('should call terminate with the correct arguments', async () => {
    const terminate = vi.fn();
    const result = await terminateHandler.implementation(
      { terminate },
      { vatId: '1' },
    );

    expect(result).toBeNull();
    expect(terminate).toHaveBeenCalledWith('1');
  });

  it('should propagate errors from terminate', async () => {
    const terminate = vi
      .fn()
      .mockRejectedValueOnce(new Error('Terminate failed'));
    await expect(
      terminateHandler.implementation({ terminate }, { vatId: '1' }),
    ).rejects.toThrow('Terminate failed');
  });
});
