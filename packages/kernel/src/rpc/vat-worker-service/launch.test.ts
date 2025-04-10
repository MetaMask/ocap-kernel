import { describe, it, expect, vi } from 'vitest';

import { launchHandler } from './launch.ts';
import type { VatConfig } from '../../types.ts';

describe('launchHandler', () => {
  it('should call launch with the correct arguments', async () => {
    const launch = vi.fn();
    const vatConfig = {} as unknown as VatConfig;
    const result = await launchHandler.implementation(
      { launch },
      { vatId: '1', vatConfig },
    );

    expect(result).toBeNull();
    expect(launch).toHaveBeenCalledWith('1', vatConfig);
  });

  it('should propagate errors from launch', async () => {
    const error = new Error('Launch failed');
    const launch = vi.fn().mockRejectedValueOnce(error);
    const vatConfig = {} as unknown as VatConfig;
    await expect(
      launchHandler.implementation({ launch }, { vatId: '1', vatConfig }),
    ).rejects.toThrow(error);
  });
});
