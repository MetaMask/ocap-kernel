import { describe, it, expect } from 'vitest';

import * as indexModule from './index.js';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule)).toStrictEqual(
      expect.arrayContaining([
        'makeCounter',
        'makeLogger',
        'stringify',
        'isPrimitive',
        'isTypedArray',
        'isTypedObject',
      ]),
    );
  });
});
