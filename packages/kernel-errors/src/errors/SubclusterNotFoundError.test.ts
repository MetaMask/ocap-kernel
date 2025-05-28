import { describe, it, expect } from 'vitest';

import { SubclusterNotFoundError } from './SubclusterNotFoundError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('SubclusterNotFoundError', () => {
  const mocksubclusterId = 'mocksubclusterId';

  it('creates a SubclusterNotFoundError with the correct properties', () => {
    const error = new SubclusterNotFoundError(mocksubclusterId);
    expect(error).toBeInstanceOf(SubclusterNotFoundError);
    expect(error.code).toBe(ErrorCode.SubclusterNotFound);
    expect(error.message).toBe('Subcluster does not exist.');
    expect(error.data).toStrictEqual({ subclusterId: mocksubclusterId });
    expect(error.cause).toBeUndefined();
  });

  it('unmarshals a valid marshaled error', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Subcluster does not exist.',
      code: ErrorCode.SubclusterNotFound,
      data: { subclusterId: mocksubclusterId },
      stack: 'stack trace',
    };

    const unmarshaledError = SubclusterNotFoundError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(SubclusterNotFoundError);
    expect(unmarshaledError.code).toBe(ErrorCode.SubclusterNotFound);
    expect(unmarshaledError.message).toBe('Subcluster does not exist.');
    expect(unmarshaledError.stack).toBe('stack trace');
    expect(unmarshaledError.data).toStrictEqual({
      subclusterId: mocksubclusterId,
    });
  });

  it('throws an error when an invalid message is unmarshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Subcluster does not exist.',
      code: ErrorCode.SubclusterNotFound,
      data: '{ subclusterId: mocksubclusterId }',
      stack: 'stack trace',
    };

    expect(() =>
      SubclusterNotFoundError.unmarshal(marshaledError, unmarshalErrorOptions),
    ).toThrow(
      'At path: data -- Expected an object, but received: "{ subclusterId: mocksubclusterId }"',
    );
  });
});
