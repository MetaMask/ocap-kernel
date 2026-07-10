import { describe, it, expect } from 'vitest';

import { IntentionalDisconnectError } from './IntentionalDisconnectError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('IntentionalDisconnectError', () => {
  const expectedMessage = 'Remote peer intentionally disconnected';

  it('creates an IntentionalDisconnectError with the canonical message and code', () => {
    const error = new IntentionalDisconnectError();
    expect(error).toBeInstanceOf(IntentionalDisconnectError);
    expect(error.code).toBe(ErrorCode.IntentionalDisconnectError);
    expect(error.message).toBe(expectedMessage);
    expect(error.data).toBeUndefined();
  });

  it('exposes the canonical name across the RPC boundary', () => {
    expect(new IntentionalDisconnectError().name).toBe(
      'IntentionalDisconnectError',
    );
  });

  it('accepts a cause', () => {
    const cause = new Error('sctp user-initiated abort');
    const error = new IntentionalDisconnectError({ cause });
    expect(error.cause).toBe(cause);
  });

  it('accepts a custom stack', () => {
    const customStack = 'custom stack trace';
    const error = new IntentionalDisconnectError({ stack: customStack });
    expect(error.stack).toBe(customStack);
  });

  it('unmarshals a valid marshaled IntentionalDisconnectError', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: expectedMessage,
      stack: 'customStack',
      code: ErrorCode.IntentionalDisconnectError,
    } as unknown as MarshaledOcapError;

    const unmarshaled = IntentionalDisconnectError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaled).toBeInstanceOf(IntentionalDisconnectError);
    expect(unmarshaled.code).toBe(ErrorCode.IntentionalDisconnectError);
    expect(unmarshaled.message).toBe(expectedMessage);
    expect(unmarshaled.stack).toBe('customStack');
  });

  it.each([
    {
      name: 'invalid data field',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
        code: ErrorCode.IntentionalDisconnectError,
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
        'At path: code -- Expected the literal `"INTENTIONAL_DISCONNECT_ERROR"`, but received: "WRONG_ERROR_CODE"',
    },
    {
      name: 'missing code',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: code -- Expected the literal `"INTENTIONAL_DISCONNECT_ERROR"`, but received: undefined',
    },
  ])(
    'throws when unmarshaling with $name',
    ({ marshaledError, expectedError }) => {
      expect(() =>
        IntentionalDisconnectError.unmarshal(
          marshaledError,
          unmarshalErrorOptions,
        ),
      ).toThrow(expectedError);
    },
  );
});
