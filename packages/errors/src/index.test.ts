import { describe, it, expect } from 'vitest';

import * as indexModule from './index.js';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'OcapError',
      'ErrorCode',
      'SupervisorReadError',
      'VatAlreadyExistsError',
      'VatCapTpConnectionExistsError',
      'VatCapTpConnectionNotFoundError',
      'VatDeletedError',
      'VatNotFoundError',
      'VatReadError',
      'isOcapError',
      'toError',
    ]);
  });
});
