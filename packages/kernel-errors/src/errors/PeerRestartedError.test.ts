import { describe, it, expect } from 'vitest';

import { PeerRestartedError } from './PeerRestartedError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('PeerRestartedError', () => {
  const expectedMessage =
    'Remote peer restarted: message not sent to avoid stale delivery';

  it('creates a PeerRestartedError with the canonical message and code', () => {
    const error = new PeerRestartedError();
    expect(error).toBeInstanceOf(PeerRestartedError);
    expect(error.code).toBe(ErrorCode.PeerRestartedError);
    expect(error.message).toBe(expectedMessage);
    expect(error.data).toBeUndefined();
  });

  it('exposes the canonical name across the RPC boundary', () => {
    // The transport-side predicate (`isTerminalSendError`) matches by `name`
    // because errors lose class identity when serialized via JSON-RPC.
    expect(new PeerRestartedError().name).toBe('PeerRestartedError');
  });

  it('accepts a cause', () => {
    const cause = new Error('Underlying handshake mismatch');
    const error = new PeerRestartedError({ cause });
    expect(error.cause).toBe(cause);
  });

  it('accepts a custom stack', () => {
    const customStack = 'custom stack trace';
    const error = new PeerRestartedError({ stack: customStack });
    expect(error.stack).toBe(customStack);
  });

  it('unmarshals a valid marshaled PeerRestartedError', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: expectedMessage,
      stack: 'customStack',
      code: ErrorCode.PeerRestartedError,
    } as unknown as MarshaledOcapError;

    const unmarshaled = PeerRestartedError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaled).toBeInstanceOf(PeerRestartedError);
    expect(unmarshaled.code).toBe(ErrorCode.PeerRestartedError);
    expect(unmarshaled.message).toBe(expectedMessage);
    expect(unmarshaled.stack).toBe('customStack');
  });

  it.each([
    {
      name: 'invalid data field',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
        code: ErrorCode.PeerRestartedError,
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
        'At path: code -- Expected the literal `"PEER_RESTARTED_ERROR"`, but received: "WRONG_ERROR_CODE"',
    },
    {
      name: 'missing code',
      marshaledError: {
        [ErrorSentinel]: true,
        message: expectedMessage,
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: code -- Expected the literal `"PEER_RESTARTED_ERROR"`, but received: undefined',
    },
  ])(
    'throws when unmarshaling with $name',
    ({ marshaledError, expectedError }) => {
      expect(() =>
        PeerRestartedError.unmarshal(marshaledError, unmarshalErrorOptions),
      ).toThrow(expectedError);
    },
  );
});
