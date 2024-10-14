import type { Json } from '@metamask/utils';
import { BaseError } from 'src/BaseError.js';
import { VatAlreadyExistsError } from 'src/errors.js';
import { describe, it, expect } from 'vitest';

import { isOcapError } from './isOcapError.js';
import { ErrorCode } from '../constants.js';

class MockCodedError extends Error {
  code: string;

  data: Json | undefined;

  constructor(message: string, code: string, data?: Json) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

describe('isOcapError', () => {
  it.each([
    [
      new BaseError(ErrorCode.VatNotFound, 'Base Error'),
      true,
      'Base class error',
    ],
    [new VatAlreadyExistsError('v1'), true, 'VatAlreadyExistsError error'],
    [
      new MockCodedError('An error occurred', 'ERROR_CODE'),
      false,
      'coded error',
    ],
    [
      new MockCodedError('An error with data occurred', 'ERROR_CODE_DATA', {
        test: 1,
      }),
      false,
      'coded error',
    ],
    [new Error('A regular error'), false, 'regular error'],
    [
      {
        message: 'Not an error',
        code: 'SOME_CODE',
        data: { test: 1 },
      } as unknown as Error,
      false,
      'non-error object',
    ],
  ])('should return %s for %s', (inputError, expectedResult) => {
    expect(isOcapError(inputError)).toBe(expectedResult);
  });
});
