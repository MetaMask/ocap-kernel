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

declare global {
  // eslint-disable-next-line no-var, @typescript-eslint/consistent-type-imports
  var HandledPromise: import('@endo/eventual-send').HandledPromiseConstructor;
}
