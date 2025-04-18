import { describe, it, expect, vi } from 'vitest';

import { initVatHandler } from './initVat.ts';
import type { InitVat } from './initVat.ts';

describe('initVatHandler', () => {
  it('should initialize a vat', async () => {
    const initVat = vi.fn(() => ({ checkpoint: 'fake' })) as unknown as InitVat;
    const result = initVatHandler.implementation(
      { initVat },
      {
        vatConfig: { sourceSpec: 'test' },
        state: {},
      },
    );
    expect(await result).toStrictEqual({
      checkpoint: 'fake',
    });
  });

  it('should propagate errors from hooks', async () => {
    const initVat = vi.fn(() => {
      throw new Error('fake');
    });
    await expect(
      initVatHandler.implementation(
        { initVat },
        {
          vatConfig: { sourceSpec: 'test' },
          state: {},
        },
      ),
    ).rejects.toThrow('fake');
  });
});
