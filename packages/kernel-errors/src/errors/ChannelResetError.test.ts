import { describe, it, expect } from 'vitest';

import { ChannelResetError } from './ChannelResetError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('ChannelResetError', () => {
  const expectedMessage = 'Channel reset by remote peer';

  it('creates a ChannelResetError with the canonical message and code', () => {
    const error = new ChannelResetError();
    expect(error).toBeInstanceOf(ChannelResetError);
    expect(error.code).toBe(ErrorCode.ChannelResetError);
    expect(error.message).toBe(expectedMessage);
    expect(error.data).toBeUndefined();
  });

  it('exposes the canonical name across the RPC boundary', () => {
    expect(new ChannelResetError().name).toBe('ChannelResetError');
  });

  it('accepts a cause', () => {
    const cause = new Error('stream reset');
    const error = new ChannelResetError({ cause });
    expect(error.cause).toBe(cause);
  });

  it('accepts a custom stack', () => {
    const customStack = 'custom stack trace';
    const error = new ChannelResetError({ stack: customStack });
    expect(error.stack).toBe(customStack);
  });

  it('unmarshals a valid marshaled ChannelResetError', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: expectedMessage,
      stack: 'customStack',
      code: ErrorCode.ChannelResetError,
    } as unknown as MarshaledOcapError;

    const unmarshaled = ChannelResetError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaled).toBeInstanceOf(ChannelResetError);
    expect(unmarshaled.code).toBe(ErrorCode.ChannelResetError);
    expect(unmarshaled.message).toBe(expectedMessage);
    expect(unmarshaled.stack).toBe('customStack');
  });

  it.each([
    {
      name: 'invalid data field',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
        code: ErrorCode.ChannelResetError,
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
        'At path: code -- Expected the literal `"CHANNEL_RESET_ERROR"`, but received: "WRONG_ERROR_CODE"',
    },
    {
      name: 'missing code',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: code -- Expected the literal `"CHANNEL_RESET_ERROR"`, but received: undefined',
    },
  ])(
    'throws when unmarshaling with $name',
    ({ marshaledError, expectedError }) => {
      expect(() =>
        ChannelResetError.unmarshal(marshaledError, unmarshalErrorOptions),
      ).toThrow(expectedError);
    },
  );
});
