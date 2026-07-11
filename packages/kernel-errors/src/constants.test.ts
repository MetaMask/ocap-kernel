import { is } from '@metamask/superstruct';
import { describe, it, expect } from 'vitest';

import { ErrorStruct } from './constants.ts';

describe('ErrorStruct', () => {
  it('accepts Error instances', () => {
    expect(is(new Error('boom'), ErrorStruct)).toBe(true);
    expect(is(new TypeError('boom'), ErrorStruct)).toBe(true);
  });

  it('rejects non-Error values', () => {
    expect(is({ message: 'boom' }, ErrorStruct)).toBe(false);
    expect(is('boom', ErrorStruct)).toBe(false);
    expect(is(null, ErrorStruct)).toBe(false);
  });
});
