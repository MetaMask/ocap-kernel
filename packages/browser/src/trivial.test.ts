import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { vi, describe, it } from 'vitest';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

describe('trivial', () => {
  it('with expect as test arg', ({ expect }) => {
    expect(true).toBe(true);
  });

  it('with delay', async ({ expect }) => {
    await delay(10);
    expect(true).toBe(true);
  });
});
