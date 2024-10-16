import { describe, it, expect } from 'vitest';

import * as indexModule from './index.js';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'ErrorCode',
      'ErrorSentinel',
      'StreamReadError',
      'VatAlreadyExistsError',
      'VatCapTpConnectionExistsError',
      'VatCapTpConnectionNotFoundError',
      'VatDeletedError',
      'VatNotFoundError',
      'isMarshaledError',
      'isMarshaledOcapError',
      'isOcapError',
      'marshalError',
      'toError',
      'unmarshalError',
    ]);
  });
});
