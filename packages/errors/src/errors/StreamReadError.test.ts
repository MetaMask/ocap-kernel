import { describe, it, expect } from 'vitest';

import { StreamReadError } from './StreamReadError.js';
import { ErrorCode, ErrorSentinel } from '../constants.js';
import type { MarshaledOcapError } from '../types.js';

describe('StreamReadError', () => {
  const mockVatId = 'mockVatId';
  const mockSupervisorId = 'mockSupervisorId';
  const mockOriginalError = new Error('Original error');

  it('creates a StreamReadError for Supervisor with the correct properties', () => {
    const error = new StreamReadError(
      { supervisorId: mockSupervisorId },
      mockOriginalError,
    );
    expect(error).toBeInstanceOf(StreamReadError);
    expect(error.code).toBe(ErrorCode.StreamReadError);
    expect(error.message).toBe('Unexpected stream read error.');
    expect(error.data).toStrictEqual({ supervisorId: mockSupervisorId });
    expect(error.cause).toBe(mockOriginalError);
  });

  it('creates a StreamReadError for Vat with the correct properties', () => {
    const error = new StreamReadError({ vatId: mockVatId }, mockOriginalError);
    expect(error).toBeInstanceOf(StreamReadError);
    expect(error.code).toBe(ErrorCode.StreamReadError);
    expect(error.message).toBe('Unexpected stream read error.');
    expect(error.data).toStrictEqual({ vatId: mockVatId });
    expect(error.cause).toBe(mockOriginalError);
  });

  it('unmarshals a valid marshaled StreamReadError for Vat', () => {
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

    const unmarshaledError = StreamReadError.unmarshal(marshaledError);
    expect(unmarshaledError).toBeInstanceOf(StreamReadError);
    expect(unmarshaledError.code).toBe(ErrorCode.StreamReadError);
    expect(unmarshaledError.message).toBe('Unexpected stream read error.');
    expect(unmarshaledError.data).toStrictEqual({
      vatId: mockVatId,
    });
    expect(unmarshaledError.cause).toBeInstanceOf(Error);
    expect((unmarshaledError.cause as Error).message).toBe('Original error');
  });

  it('unmarshals a valid marshaled StreamReadError for Supervisor', () => {
    const data = { supervisorId: mockSupervisorId };
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

    const unmarshaledError = StreamReadError.unmarshal(marshaledError);
    expect(unmarshaledError).toBeInstanceOf(StreamReadError);
    expect(unmarshaledError.code).toBe(ErrorCode.StreamReadError);
    expect(unmarshaledError.message).toBe('Unexpected stream read error.');
    expect(unmarshaledError.data).toStrictEqual({
      supervisorId: mockSupervisorId,
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

    expect(() => StreamReadError.unmarshal(marshaledError)).toThrow(
      'At path: data -- Expected the value to satisfy a union of `object | object`, but received: "invalid data"',
    );
  });

  it('throws when both vatId and supervisorId are present in data', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Unexpected stream read error.',
      stack: 'customStack',
      code: ErrorCode.StreamReadError,
      data: { supervisorId: mockSupervisorId, vatId: mockVatId },
      cause: {
        [ErrorSentinel]: true,
        message: 'Original error',
        stack: 'bar',
      },
    };

    expect(() => StreamReadError.unmarshal(marshaledError)).toThrow(
      'At path: data -- Expected the value to satisfy a union of `object | object`, but received: [object Object]',
    );
  });
});
