import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'callable',
      'collectSheafGuard',
      'constant',
      'fallthrough',
      'makeRemoteSection',
      'makeSection',
      'noopPolicy',
      'proxyPolicy',
      'sheafify',
      'withFilter',
      'withRanking',
    ]);
  });
});
