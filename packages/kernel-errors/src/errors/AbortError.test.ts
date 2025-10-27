import { describe, it, expect } from 'vitest';

import { AbortError } from './AbortError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('AbortError', () => {
  it('creates an AbortError with the correct properties', () => {
    const error = new AbortError();
    expect(error).toBeInstanceOf(AbortError);
    expect(error.code).toBe(ErrorCode.AbortError);
    expect(error.message).toBe('Operation aborted.');
    expect(error.data).toBeUndefined();
  });

  it('creates an AbortError with a cause', () => {
    const cause = new Error('Original error');
    const error = new AbortError({ cause });
    expect(error).toBeInstanceOf(AbortError);
    expect(error.code).toBe(ErrorCode.AbortError);
    expect(error.message).toBe('Operation aborted.');
    expect(error.cause).toBe(cause);
  });

  it('creates an AbortError with a custom stack', () => {
    const customStack = 'custom stack trace';
    const error = new AbortError({ stack: customStack });
    expect(error).toBeInstanceOf(AbortError);
    expect(error.stack).toBe(customStack);
  });

  it('creates an AbortError with both cause and stack', () => {
    const cause = new Error('Root cause');
    const customStack = 'custom stack';
    const error = new AbortError({ cause, stack: customStack });
    expect(error).toBeInstanceOf(AbortError);
    expect(error.code).toBe(ErrorCode.AbortError);
    expect(error.message).toBe('Operation aborted.');
    expect(error.cause).toBe(cause);
    expect(error.stack).toBe(customStack);
  });

  it('unmarshals a valid marshaled AbortError', () => {
    // @ts-expect-error - we want to test the error case
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Operation aborted.',
      stack: 'customStack',
      code: ErrorCode.AbortError,
    };

    const unmarshaledError = AbortError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(AbortError);
    expect(unmarshaledError.code).toBe(ErrorCode.AbortError);
    expect(unmarshaledError.message).toBe('Operation aborted.');
    expect(unmarshaledError.stack).toBe('customStack');
  });

  it('can have a cause', () => {
    const cause = new Error('Timeout exceeded');
    const error = new AbortError({ cause });
    expect(error.cause).toBe(cause);
  });

  it.each([
    {
      name: 'invalid data field',
      marshaledError: {
        [ErrorSentinel]: true,
        message: 'Operation aborted.',
        code: ErrorCode.AbortError,
        data: { unexpected: 'field' }, // AbortError should not have data
        stack: 'stack trace',
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: data -- Expected a value of type `never`, but received: `[object Object]`',
    },
    {
      name: 'wrong error code',
      marshaledError: {
        [ErrorSentinel]: true,
        message: 'Operation aborted.',
        code: 'WRONG_ERROR_CODE' as ErrorCode,
        stack: 'stack trace',
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: code -- Expected the literal `"ABORT_ERROR"`, but received: "WRONG_ERROR_CODE"',
    },
    {
      name: 'missing required fields',
      marshaledError: {
        [ErrorSentinel]: true,
        message: 'Operation aborted.',
        // Missing code field
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: code -- Expected the literal `"ABORT_ERROR"`, but received: undefined',
    },
  ])(
    'throws an error when unmarshaling with $name',
    ({ marshaledError, expectedError }) => {
      expect(() =>
        AbortError.unmarshal(marshaledError, unmarshalErrorOptions),
      ).toThrow(expectedError);
    },
  );
});
