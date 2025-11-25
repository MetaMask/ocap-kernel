import { it, expect, describe } from 'vitest';

import math from './math.ts';

describe('math', () => {
  it.each([
    ['count', { word: 'abcdefg' }, 7],
    ['add', { summands: [1, 2, 3, 4] }, 10],
    ['multiply', { factors: [1, 2, 3, 4] }, 24],
  ])('%s(%s) = %s', async (name, args, expected) => {
    const capability = math[name as keyof typeof math];
    expect(capability).toBeDefined();
    expect(await capability.func(args as never)).toStrictEqual(expected);
  });
});
