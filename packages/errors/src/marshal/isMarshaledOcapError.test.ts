import { describe, it, expect } from 'vitest';

import { isMarshaledOcapError } from './isMarshaledOcapError.js';
import { ErrorCode, ErrorSentinel } from '../constants.js';

describe('isMarshaledOcapError', () => {
  it.each([
    [
      'valid marshaled error with required fields only',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
        code: ErrorCode.VatNotFound,
        data: { key: 'value' },
      },
      true,
    ],
    [
      'valid marshaled error with optional fields',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
        code: ErrorCode.VatNotFound,
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
        code: ErrorCode.VatNotFound,
        data: { key: 'value' },
        cause: {
          [ErrorSentinel]: true,
          message: 'Nested error occurred',
        },
      },
      true,
    ],
    [
      'object with invalid code value',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
        code: 'ERROR_CODE',
        data: { key: 'value' },
      },
      false,
    ],
    [
      'object missing the sentinel value',
      {
        message: 'An error occurred',
        code: ErrorCode.VatNotFound,
        data: { key: 'value' },
      },
      false,
    ],
    [
      'object missing the message value',
      {
        [ErrorSentinel]: true,
        code: ErrorCode.VatNotFound,
        data: { key: 'value' },
      },
      false,
    ],
    [
      'object missing the code value',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
        data: { key: 'value' },
      },
      false,
    ],
    [
      'object missing the data value',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
        code: ErrorCode.VatNotFound,
      },
      false,
    ],
    [
      'object with incorrect sentinel value',
      {
        [ErrorSentinel]: false,
        message: 'An error occurred',
        code: ErrorCode.VatNotFound,
        data: { key: 'value' },
      },
      false,
    ],
    ['null value', null, false],
    ['undefined value', undefined, false],
    ['string value', 'string', false],
    ['number value', 123, false],
    ['array value', [], false],
  ])('should return %s', (_, value, expected) => {
    expect(isMarshaledOcapError(value)).toBe(expected);
  });
});
