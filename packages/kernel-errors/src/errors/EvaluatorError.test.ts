import { describe, it, expect } from 'vitest';

import { EvaluatorError } from './EvaluatorError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('EvaluatorError', () => {
  const mockMessage = 'REPL evaluation failed';
  const mockCode = 'const x = 1;';
  const mockCause = new Error('Internal: $return threw an error');

  it('creates an EvaluatorError with the correct properties', () => {
    const error = new EvaluatorError(mockMessage, mockCode, mockCause);
    expect(error).toBeInstanceOf(EvaluatorError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(ErrorCode.InternalError);
    expect(error.message).toBe(mockMessage);
    expect(error.data).toStrictEqual({ code: mockCode });
    expect(error.cause).toBe(mockCause);
  });

  it('creates an EvaluatorError with optional error options', () => {
    const mockStack = 'custom stack trace';
    const error = new EvaluatorError(mockMessage, mockCode, mockCause, {
      stack: mockStack,
    });
    expect(error.stack).toBe(mockStack);
    expect(error.data).toStrictEqual({ code: mockCode });
    expect(error.cause).toBe(mockCause);
  });

  it('unmarshals a valid marshaled EvaluatorError', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: mockMessage,
      stack: 'customStack',
      code: ErrorCode.InternalError,
      data: { code: mockCode },
      cause: {
        [ErrorSentinel]: true,
        message: 'Internal: $return threw an error',
        stack: 'causeStack',
      },
    };

    const unmarshaledError = EvaluatorError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(EvaluatorError);
    expect(unmarshaledError.code).toBe(ErrorCode.InternalError);
    expect(unmarshaledError.message).toBe(mockMessage);
    expect(unmarshaledError.stack).toBe('customStack');
    expect(unmarshaledError.data).toStrictEqual({ code: mockCode });
    expect(unmarshaledError.cause).toBeInstanceOf(Error);
    expect((unmarshaledError.cause as Error).message).toBe(
      'Internal: $return threw an error',
    );
  });

  it('unmarshals an EvaluatorError without a cause', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: mockMessage,
      code: ErrorCode.InternalError,
      data: { code: mockCode },
    };

    const unmarshaledError = EvaluatorError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(EvaluatorError);
    expect(unmarshaledError.data).toStrictEqual({ code: mockCode });
    expect(unmarshaledError.cause).toBeInstanceOf(Error);
    expect((unmarshaledError.cause as Error).message).toBe('Unknown cause');
  });

  it('throws an error when an invalid data structure is unmarshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: mockMessage,
      code: ErrorCode.InternalError,
      data: 'invalid data',
      stack: 'stack trace',
    };

    expect(() =>
      EvaluatorError.unmarshal(marshaledError, unmarshalErrorOptions),
    ).toThrow(/At path: data --/u);
  });

  it('throws an error when an invalid code is unmarshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: mockMessage,
      code: ErrorCode.VatNotFound,
      data: { code: mockCode },
      stack: 'stack trace',
    };

    expect(() =>
      EvaluatorError.unmarshal(marshaledError, unmarshalErrorOptions),
    ).toThrow(/At path: code --/u);
  });
});
