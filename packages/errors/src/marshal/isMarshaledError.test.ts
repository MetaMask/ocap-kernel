import { describe, it, expect } from 'vitest';

import { isMarshaledError } from './isMarshaledError.js';
import { ErrorSentinel } from '../types.js';

describe('isMarshaledError', () => {
  it.each([
    [
      'valid marshaled error with required fields only',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
      },
      true,
    ],
    [
      'valid marshaled error with optional fields',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
        code: 'ERROR_CODE',
        data: { key: 'value' },
        stack: 'Error stack trace',
        cause: 'Another error',
      },
      true,
    ],
    [
      'valid marshaled error with nested cause',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
        cause: {
          [ErrorSentinel]: true,
          message: 'Nested error occurred',
        },
      },
      true,
    ],
    [
      'object missing the sentinel value',
      {
        message: 'An error occurred',
      },
      false,
    ],
    [
      'object missing the message value',
      {
        [ErrorSentinel]: true,
      },
      false,
    ],
    [
      'object with incorrect sentinel value',
      {
        [ErrorSentinel]: false,
        message: 'An error occurred',
      },
      false,
    ],
    ['null value', null, false],
    ['undefined value', undefined, false],
    ['string value', 'string', false],
    ['number value', 123, false],
    ['array value', [], false],
  ])('should return %s', (_, value, expected) => {
    expect(isMarshaledError(value)).toBe(expected);
  });
});
