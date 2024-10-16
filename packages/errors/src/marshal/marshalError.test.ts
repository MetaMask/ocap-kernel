import { describe, it, expect } from 'vitest';

import { marshalError } from './marshalError.js';
import { VatNotFoundError } from '../errors/VatNotFoundError.js';
import { ErrorCode, ErrorSentinel } from '../types.js';

describe('marshalError', () => {
  it('should marshal an error', () => {
    const error = new Error('foo');
    const marshaledError = marshalError(error);
    expect(marshaledError).toStrictEqual(
      expect.objectContaining({
        [ErrorSentinel]: true,
        message: 'foo',
        stack: expect.any(String),
      }),
    );
  });

  it('should marshal an error with a cause', () => {
    const cause = new Error('baz');
    const error = new Error('foo', { cause });
    const marshaledError = marshalError(error);
    expect(marshaledError).toStrictEqual(
      expect.objectContaining({
        [ErrorSentinel]: true,
        message: 'foo',
        stack: expect.any(String),
        cause: {
          [ErrorSentinel]: true,
          message: 'baz',
          stack: expect.any(String),
        },
      }),
    );
  });

  it('should marshal an error with a non-error cause', () => {
    const cause = { bar: 'baz' };
    const error = new Error('foo', { cause });
    const marshaledError = marshalError(error);
    expect(marshaledError).toStrictEqual(
      expect.objectContaining({
        [ErrorSentinel]: true,
        message: 'foo',
        stack: expect.any(String),
        cause: JSON.stringify(cause),
      }),
    );
  });

  it('should marshal an ocap error', () => {
    const error = new VatNotFoundError('v1');
    const marshaledError = marshalError(error);
    expect(marshaledError).toStrictEqual(
      expect.objectContaining({
        [ErrorSentinel]: true,
        message: 'Vat does not exist.',
        stack: expect.any(String),
        code: ErrorCode.VatNotFound,
        data: { vatId: 'v1' },
      }),
    );
  });
});
