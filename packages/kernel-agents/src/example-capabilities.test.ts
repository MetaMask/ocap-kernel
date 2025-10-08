import { describe, it, expect } from 'vitest';

import { exampleCapabilities } from './example-capabilities.ts';

describe('exampleCapabilities', () => {
  it('contains the correct capabilities', () => {
    expect(exampleCapabilities).toBeDefined();
    expect(Object.keys(exampleCapabilities)).toStrictEqual([
      'count',
      'add',
      'multiply',
    ]);
  });

  it.each([
    ['count', { word: 'abcdefg' }, 7],
    ['add', { summands: [1, 2, 3, 4] }, 10],
    ['multiply', { factors: [1, 2, 3, 4] }, 24],
  ])('%s(%s) = %s', async (name, args, expected) => {
    const capability =
      exampleCapabilities[name as keyof typeof exampleCapabilities];
    expect(capability).toBeDefined();
    expect(await capability.func(args as never)).toStrictEqual(expected);
  });
});
