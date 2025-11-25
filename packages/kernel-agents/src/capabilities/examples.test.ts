import { describe, it, expect } from 'vitest';

import { exampleCapabilities } from './examples.ts';

describe('exampleCapabilities', () => {
  it('contains the correct capabilities', () => {
    expect(exampleCapabilities).toBeDefined();
    expect(Object.keys(exampleCapabilities)).toStrictEqual([
      'search',
      'getMoonPhase',
    ]);
  });
});
