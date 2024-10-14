import { describe, it, expect } from 'vitest';

import { isCodedError } from './isCodedError.js';
import { BaseError } from '../BaseError.js';
import { ErrorCode } from '../constants.js';
import { VatAlreadyExistsError } from '../errors.js';

class MockCodedError extends Error {
  code: string | number;

  constructor(message: string, code: string | number) {
    super(message);
    this.code = code;
  }
}

describe('isCodedError', () => {
  it.each([
    [
      new MockCodedError('An error occurred', 'ERROR_CODE'),
      true,
      'coded error with string code',
    ],
    [
      new MockCodedError('An error occurred', 12345),
      true,
      'coded error with number code',
    ],
    [
      new BaseError(ErrorCode.VatNotFound, 'Base Error'),
      true,
      'Base class error',
    ],
    [new VatAlreadyExistsError('v1'), true, 'VatAlreadyExistsError error'],
    [new Error('An error without a code'), false, 'error without a code'],
    [
      { message: 'Not an error', code: 'SOME_CODE' } as unknown as Error,
      false,
      'non-error object',
    ],
    [
      { message: 'Invalid code type', code: {} } as unknown as Error,
      false,
      'non-string/non-number code',
    ],
  ])('should return %s for %s', (inputError, expectedResult) => {
    expect(isCodedError(inputError)).toBe(expectedResult);
  });
});
