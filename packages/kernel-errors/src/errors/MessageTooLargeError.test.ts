import { describe, it, expect } from 'vitest';

import { MessageTooLargeError } from './MessageTooLargeError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('MessageTooLargeError', () => {
  const expectedMessage = 'Inbound message exceeds size limit';

  it('creates a MessageTooLargeError with the canonical message and code', () => {
    const error = new MessageTooLargeError();
    expect(error).toBeInstanceOf(MessageTooLargeError);
    expect(error.code).toBe(ErrorCode.MessageTooLargeError);
    expect(error.message).toBe(expectedMessage);
    expect(error.data).toBeUndefined();
  });

  it('exposes the canonical name across the RPC boundary', () => {
    expect(new MessageTooLargeError().name).toBe('MessageTooLargeError');
  });

  it('accepts a cause', () => {
    const cause = new Error('invalid data length');
    const error = new MessageTooLargeError({ cause });
    expect(error.cause).toBe(cause);
  });

  it('accepts a custom stack', () => {
    const customStack = 'custom stack trace';
    const error = new MessageTooLargeError({ stack: customStack });
    expect(error.stack).toBe(customStack);
  });

  it('unmarshals a valid marshaled MessageTooLargeError', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: expectedMessage,
      stack: 'customStack',
      code: ErrorCode.MessageTooLargeError,
    } as unknown as MarshaledOcapError;

    const unmarshaled = MessageTooLargeError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaled).toBeInstanceOf(MessageTooLargeError);
    expect(unmarshaled.code).toBe(ErrorCode.MessageTooLargeError);
    expect(unmarshaled.message).toBe(expectedMessage);
    expect(unmarshaled.stack).toBe('customStack');
  });

  it.each([
    {
      name: 'invalid data field',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
        code: ErrorCode.MessageTooLargeError,
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
        'At path: code -- Expected the literal `"MESSAGE_TOO_LARGE_ERROR"`, but received: "WRONG_ERROR_CODE"',
    },
    {
      name: 'missing code',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: code -- Expected the literal `"MESSAGE_TOO_LARGE_ERROR"`, but received: undefined',
    },
  ])(
    'throws when unmarshaling with $name',
    ({ marshaledError, expectedError }) => {
      expect(() =>
        MessageTooLargeError.unmarshal(marshaledError, unmarshalErrorOptions),
      ).toThrow(expectedError);
    },
  );
});
