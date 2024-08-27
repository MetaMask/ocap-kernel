import './endoify.js';
import { describe, expect, it } from 'vitest';

describe('endoified', () => {
  it('calls lockdown', () => {
    expect(Object.isFrozen(Array.prototype)).toBe(true); // Due to `lockdown()`, and therefore `ses`
  });

  it('loads eventual-send', () => {
    expect(typeof HandledPromise).not.toBe('undefined'); // Due to eventual send
  });
});

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
    (): boolean => {
      try {
        return !Object.assign(harden({ a: 1 }), { b: 2 });
      } catch {
        return true;
      }
    },
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
  // eslint-disable-next-line no-var, @typescript-eslint/consistent-type-imports
  var HandledPromise: import('@endo/eventual-send').HandledPromiseConstructor;
}
