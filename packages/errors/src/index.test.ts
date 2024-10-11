import { describe, it, expect } from 'vitest';

import * as indexModule from './index.js';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'CapTPConnectionExistsError',
      'CapTPConnectionNotFoundError',
      'ErrorCode',
      'SupervisorReadError',
      'VatAlreadyExistsError',
      'VatDeletedError',
      'VatNotFoundError',
      'VatReadError',
      'asError',
    ]);
  });
});
