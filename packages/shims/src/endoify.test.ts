import './endoify.js';
import type { HandledPromiseConstructor } from '@endo/eventual-send';
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
  // eslint-disable-next-line no-var
  var HandledPromise: HandledPromiseConstructor;
}
