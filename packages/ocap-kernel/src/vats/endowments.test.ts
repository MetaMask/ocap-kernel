import { describe, it, expect } from 'vitest';

import { DEFAULT_ALLOWED_GLOBALS } from './endowments.ts';

describe('DEFAULT_ALLOWED_GLOBALS', () => {
  it('contains the expected global names', () => {
    expect(Object.keys(DEFAULT_ALLOWED_GLOBALS).sort()).toStrictEqual([
      'AbortController',
      'AbortSignal',
      'Date',
      'TextDecoder',
      'TextEncoder',
      'URL',
      'URLSearchParams',
      'atob',
      'btoa',
      'clearTimeout',
      'setTimeout',
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_ALLOWED_GLOBALS)).toBe(true);
  });
});
