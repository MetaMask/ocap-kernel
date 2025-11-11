import { describe, it, expect } from 'vitest';

import { SampleGenerationError } from './SampleGenerationError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('SampleGenerationError', () => {
  const mockSample = 'const x = invalid syntax';
  const mockCause = new SyntaxError('Unexpected token');

  it('creates a SampleGenerationError with the correct properties', () => {
    const error = new SampleGenerationError(mockSample, mockCause);
    expect(error).toBeInstanceOf(SampleGenerationError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(ErrorCode.SampleGenerationError);
    expect(error.message).toBe('LLM generated invalid response.');
    expect(error.data).toStrictEqual({ sample: mockSample });
    expect(error.cause).toBe(mockCause);
  });

  it('creates a SampleGenerationError with optional error options', () => {
    const mockStack = 'custom stack trace';
    const error = new SampleGenerationError(mockSample, mockCause, {
      stack: mockStack,
    });
    expect(error.stack).toBe(mockStack);
    expect(error.data).toStrictEqual({ sample: mockSample });
    expect(error.cause).toBe(mockCause);
  });

  it('unmarshals a valid marshaled SampleGenerationError', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'LLM generated invalid response.',
      stack: 'customStack',
      code: ErrorCode.SampleGenerationError,
      data: { sample: mockSample },
      cause: {
        [ErrorSentinel]: true,
        message: 'Unexpected token',
        stack: 'syntaxErrorStack',
      },
    };

    const unmarshaledError = SampleGenerationError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(SampleGenerationError);
    expect(unmarshaledError.code).toBe(ErrorCode.SampleGenerationError);
    expect(unmarshaledError.message).toBe('LLM generated invalid response.');
    expect(unmarshaledError.stack).toBe('customStack');
    expect(unmarshaledError.data).toStrictEqual({ sample: mockSample });
    expect(unmarshaledError.cause).toBeInstanceOf(Error);
    expect((unmarshaledError.cause as Error).message).toBe('Unexpected token');
  });

  it('unmarshals a SampleGenerationError without a cause', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'LLM generated invalid response.',
      code: ErrorCode.SampleGenerationError,
      data: { sample: mockSample },
    };

    const unmarshaledError = SampleGenerationError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(SampleGenerationError);
    expect(unmarshaledError.data).toStrictEqual({ sample: mockSample });
    expect(unmarshaledError.cause).toBeInstanceOf(Error);
    expect((unmarshaledError.cause as Error).message).toBe('Unknown cause');
  });

  it('throws an error when an invalid data structure is unmarshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'LLM generated invalid response.',
      code: ErrorCode.SampleGenerationError,
      data: 'invalid data',
      stack: 'stack trace',
    };

    expect(() =>
      SampleGenerationError.unmarshal(marshaledError, unmarshalErrorOptions),
    ).toThrow(/At path: data --/u);
  });

  it('throws an error when an invalid code is unmarshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'LLM generated invalid response.',
      code: ErrorCode.VatNotFound,
      data: { sample: mockSample },
      stack: 'stack trace',
    };

    expect(() =>
      SampleGenerationError.unmarshal(marshaledError, unmarshalErrorOptions),
    ).toThrow(/At path: code --/u);
  });
});
