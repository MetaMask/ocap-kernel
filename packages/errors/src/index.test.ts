import { describe, it, expect } from 'vitest';

import * as indexModule from './index.js';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'OcapError',
      'ErrorCode',
      'StreamReadError',
      'VatAlreadyExistsError',
      'VatCapTpConnectionExistsError',
      'VatCapTpConnectionNotFoundError',
      'VatDeletedError',
      'VatNotFoundError',
      'isCodedError',
      'isOcapError',
      'toError',
    ]);
  });
});
