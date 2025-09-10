import { describe, it, expect } from 'vitest';

import { DuplicateEndowmentError } from './DuplicateEndowmentError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('DuplicateEndowmentError', () => {
  const mockEndowmentName = 'mockEndowmentName';

  it('creates a DuplicateEndowmentError with the correct properties', () => {
    const error = new DuplicateEndowmentError(mockEndowmentName, false);
    expect(error).toBeInstanceOf(DuplicateEndowmentError);
    expect(error.code).toBe(ErrorCode.DuplicateEndowment);
    expect(error.message).toBe('Duplicate endowment.');
    expect(error.data).toStrictEqual({
      endowmentName: mockEndowmentName,
      isInternal: false,
    });
    expect(error.cause).toBeUndefined();
  });

  it('unmarshals a valid marshaled error', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Duplicate endowment.',
      code: ErrorCode.DuplicateEndowment,
      data: { endowmentName: mockEndowmentName, isInternal: false },
      stack: 'stack trace',
    };

    const unmarshaledError = DuplicateEndowmentError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(DuplicateEndowmentError);
    expect(unmarshaledError.code).toBe(ErrorCode.DuplicateEndowment);
    expect(unmarshaledError.message).toBe('Duplicate endowment.');
    expect(unmarshaledError.stack).toBe('stack trace');
    expect(unmarshaledError.data).toStrictEqual({
      endowmentName: mockEndowmentName,
      isInternal: false,
    });
  });

  it('throws an error when an invalid message is unmarshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Duplicate endowment.',
      code: ErrorCode.DuplicateEndowment,
      data: '{ endowmentName: mockEndowmentName, isInternal: false }',
      stack: 'stack trace',
    };

    expect(() =>
      DuplicateEndowmentError.unmarshal(marshaledError, unmarshalErrorOptions),
    ).toThrow(
      'At path: data -- Expected an object, but received: "{ endowmentName: mockEndowmentName, isInternal: false }"',
    );
  });
});
