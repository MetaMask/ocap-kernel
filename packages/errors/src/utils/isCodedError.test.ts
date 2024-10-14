import { BaseError } from 'src/BaseError.js';
import { VatAlreadyExistsError } from 'src/errors.js';
import { describe, it, expect } from 'vitest';

import { isCodedError } from './isCodedError.js';
import { ErrorCode } from '../constants.js';

class MockCodedError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

describe('isCodedError', () => {
  it.each([
    [
      new MockCodedError('An error occurred', 'ERROR_CODE'),
      true,
      'coded error',
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
  ])('should return %s for %s', (inputError, expectedResult) => {
    expect(isCodedError(inputError)).toBe(expectedResult);
  });
});
