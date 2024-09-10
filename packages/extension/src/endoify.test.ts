import './endoify.js';
import type { HandledPromiseConstructor } from '@endo/eventual-send';
import { describe, expect, it } from 'vitest';

describe(`endoify`, () => {
  const assertions = [
    (): boolean => typeof globalThis === 'object',
    (): boolean => typeof lockdown === 'function',
    (): boolean => typeof repairIntrinsics === 'function',
    (): boolean => typeof Compartment === 'function',
    (): boolean => typeof assert === 'function',
    (): boolean => typeof HandledPromise === 'function',
    (): boolean => typeof harden === 'function',
    (): boolean => typeof getStackString === 'function',
    (): boolean => Object.isFrozen(Array.prototype),
  ];

  for (const assertion of assertions) {
    it(`asserts ${String(assertion).replace(/^.*?=>\s*/u, '')}`, () => {
      expect(assertion()).toBe(true);
    });
  }
});

declare global {
  // eslint-disable-next-line no-var
  var getStackString: (error: Error) => string;
  // eslint-disable-next-line no-var
  var HandledPromise: HandledPromiseConstructor;
}
