// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { vi } from 'vitest';

import { makePromiseKitMock } from '../promise-kit.js';

globalThis.lockdown = (): void => undefined;
globalThis.harden = vi.fn(<Value>(value: Value): Readonly<Value> => value);

vi.mock('@endo/promise-kit', async () => {
  return makePromiseKitMock();
});

export {};
