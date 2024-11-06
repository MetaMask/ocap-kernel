import { describe, it, expect } from 'vitest';

import { marshalError } from './marshalError.js';
import { BaseError } from '../BaseError.js';
import { ErrorCode, ErrorSentinel } from '../constants.js';
import { VatNotFoundError } from '../errors/VatNotFoundError.js';

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

  it('should marshal an error without a stack', () => {
    const error = new Error('foo');
    delete error.stack;
    const marshaledError = marshalError(error);
    expect(marshaledError).toStrictEqual(
      expect.objectContaining({
        [ErrorSentinel]: true,
        message: 'foo',
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

  it('should marshal an ocap error with data', () => {
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

  it('should marshal an ocap error without data', () => {
    const error = new BaseError(ErrorCode.StreamReadError, 'message', {
      stack: 'stack',
    });
    const marshaledError = marshalError(error);
    expect(marshaledError).toStrictEqual(
      expect.objectContaining({
        [ErrorSentinel]: true,
        message: 'message',
        stack: expect.any(String),
        code: ErrorCode.StreamReadError,
      }),
    );
  });
});
