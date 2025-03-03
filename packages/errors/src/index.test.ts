import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'ErrorCode',
      'ErrorSentinel',
      'ErrorStruct',
      'MarshaledErrorStruct',
      'MarshaledOcapErrorStruct',
      'StreamReadError',
      'VatAlreadyExistsError',
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
