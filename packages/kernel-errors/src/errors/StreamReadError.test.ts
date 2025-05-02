import { describe, it, expect } from 'vitest';

import { StreamReadError } from './StreamReadError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('StreamReadError', () => {
  const mockVatId = 'mockVatId';
  const mockOriginalError = new Error('Original error');

  it('creates a StreamReadError for VatSupervisor with the correct properties', () => {
    const error = new StreamReadError(
      { vatId: mockVatId },
      { cause: mockOriginalError },
    );
    expect(error).toBeInstanceOf(StreamReadError);
    expect(error.code).toBe(ErrorCode.StreamReadError);
    expect(error.message).toBe('Unexpected stream read error.');
    expect(error.data).toStrictEqual({ vatId: mockVatId });
    expect(error.cause).toBe(mockOriginalError);
  });

  it('creates a StreamReadError for VatHandle with the correct properties', () => {
    const error = new StreamReadError(
      { vatId: mockVatId },
      { cause: mockOriginalError },
    );
    expect(error).toBeInstanceOf(StreamReadError);
    expect(error.code).toBe(ErrorCode.StreamReadError);
    expect(error.message).toBe('Unexpected stream read error.');
    expect(error.data).toStrictEqual({ vatId: mockVatId });
    expect(error.cause).toBe(mockOriginalError);
  });

  it('creates a StreamReadError for Kernel with the correct properties', () => {
    const error = new StreamReadError(
      { kernelId: 'kernel' },
      { cause: mockOriginalError },
    );
    expect(error).toBeInstanceOf(StreamReadError);
    expect(error.code).toBe(ErrorCode.StreamReadError);
    expect(error.message).toBe('Unexpected stream read error.');
    expect(error.data).toStrictEqual({ kernelId: 'kernel' });
    expect(error.cause).toBe(mockOriginalError);
  });

  it('unmarshals a valid marshaled StreamReadError for VatHandle', () => {
    const data = { vatId: mockVatId };
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Unexpected stream read error.',
      stack: 'customStack',
      code: ErrorCode.StreamReadError,
      data,
      cause: {
        [ErrorSentinel]: true,
        message: 'Original error',
        stack: 'bar',
      },
    };

    const unmarshaledError = StreamReadError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(StreamReadError);
    expect(unmarshaledError.code).toBe(ErrorCode.StreamReadError);
    expect(unmarshaledError.message).toBe('Unexpected stream read error.');
    expect(unmarshaledError.stack).toBe('customStack');
    expect(unmarshaledError.data).toStrictEqual({
      vatId: mockVatId,
    });
    expect(unmarshaledError.cause).toBeInstanceOf(Error);
    expect((unmarshaledError.cause as Error).message).toBe('Original error');
  });

  it('unmarshals a valid marshaled StreamReadError for VatSupervisor', () => {
    const data = { vatId: mockVatId };
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Unexpected stream read error.',
      stack: 'customStack',
      code: ErrorCode.StreamReadError,
      data,
      cause: {
        [ErrorSentinel]: true,
        message: 'Original error',
        stack: 'bar',
      },
    };

    const unmarshaledError = StreamReadError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(StreamReadError);
    expect(unmarshaledError.code).toBe(ErrorCode.StreamReadError);
    expect(unmarshaledError.message).toBe('Unexpected stream read error.');
    expect(unmarshaledError.stack).toBe('customStack');
    expect(unmarshaledError.data).toStrictEqual({
      vatId: mockVatId,
    });
    expect(unmarshaledError.cause).toBeInstanceOf(Error);
    expect((unmarshaledError.cause as Error).message).toBe('Original error');
  });

  it('throws an error when an invalid message is unmarshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Unexpected stream read error.',
      code: ErrorCode.StreamReadError,
      data: 'invalid data',
      stack: 'stack trace',
    };

    expect(() =>
      StreamReadError.unmarshal(marshaledError, unmarshalErrorOptions),
    ).toThrow(
      'At path: data -- Expected the value to satisfy a union of `object | object | object`, but received: "invalid data"',
    );
  });
});
