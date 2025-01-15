// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { vi } from 'vitest';

globalThis.lockdown = (): void => undefined;
globalThis.harden = vi.fn(<Value>(value: Value): Readonly<Value> => value);

vi.mock('@endo/promise-kit', async () => {
  const { makePromiseKitMock } = await import('@ocap/test-utils');
  return makePromiseKitMock();
});

export {};
