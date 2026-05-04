import { describe, it, expect } from 'vitest';

import { IntentionalCloseError } from './IntentionalCloseError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('IntentionalCloseError', () => {
  const expectedMessage = 'Message delivery failed after intentional close';

  it('creates an IntentionalCloseError with the canonical message and code', () => {
    const error = new IntentionalCloseError();
    expect(error).toBeInstanceOf(IntentionalCloseError);
    expect(error.code).toBe(ErrorCode.IntentionalCloseError);
    expect(error.message).toBe(expectedMessage);
    expect(error.data).toBeUndefined();
  });

  it('exposes the canonical name across the RPC boundary', () => {
    expect(new IntentionalCloseError().name).toBe('IntentionalCloseError');
  });

  it('accepts a cause', () => {
    const cause = new Error('User explicitly disconnected');
    const error = new IntentionalCloseError({ cause });
    expect(error.cause).toBe(cause);
  });

  it('accepts a custom stack', () => {
    const customStack = 'custom stack trace';
    const error = new IntentionalCloseError({ stack: customStack });
    expect(error.stack).toBe(customStack);
  });

  it('unmarshals a valid marshaled IntentionalCloseError', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: expectedMessage,
      stack: 'customStack',
      code: ErrorCode.IntentionalCloseError,
    } as unknown as MarshaledOcapError;

    const unmarshaled = IntentionalCloseError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaled).toBeInstanceOf(IntentionalCloseError);
    expect(unmarshaled.code).toBe(ErrorCode.IntentionalCloseError);
    expect(unmarshaled.message).toBe(expectedMessage);
    expect(unmarshaled.stack).toBe('customStack');
  });

  it.each([
    {
      name: 'invalid data field',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
        code: ErrorCode.IntentionalCloseError,
        data: { unexpected: 'field' },
        stack: 'stack trace',
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: data -- Expected a value of type `never`, but received: `[object Object]`',
    },
    {
      name: 'wrong error code',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
        code: 'WRONG_ERROR_CODE' as ErrorCode,
        stack: 'stack trace',
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: code -- Expected the literal `"INTENTIONAL_CLOSE_ERROR"`, but received: "WRONG_ERROR_CODE"',
    },
    {
      name: 'missing code',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: code -- Expected the literal `"INTENTIONAL_CLOSE_ERROR"`, but received: undefined',
    },
  ])(
    'throws when unmarshaling with $name',
    ({ marshaledError, expectedError }) => {
      expect(() =>
        IntentionalCloseError.unmarshal(marshaledError, unmarshalErrorOptions),
      ).toThrow(expectedError);
    },
  );
});
