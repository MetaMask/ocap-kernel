// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { vi } from 'vitest';

globalThis.lockdown = (): void => undefined;
globalThis.harden = vi.fn(<Value>(value: Value): Readonly<Value> => value);
globalThis.assert = vi.fn(
  (..._: unknown[]): boolean => true,
) as unknown as typeof globalThis.assert;
for (const prop of [
  'typeof',
  'error',
  'fail',
  'equal',
  'string',
  'note',
  'details',
  'Fail',
  'quote',
  'makeAssert',
]) {
  Object.defineProperty(globalThis.assert, prop, { value: vi.fn() });
}
globalThis.HandledPromise = Promise as typeof globalThis.HandledPromise;
Object.defineProperty(globalThis, 'Compartment', {
  value: class Compartment {
    evaluate(expr: string): unknown {
      // eslint-disable-next-line no-eval
      return eval(expr);
    }
  },
});

export {};
