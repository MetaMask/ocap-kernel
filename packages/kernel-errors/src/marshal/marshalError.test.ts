import { describe, it, expect } from 'vitest';

import { marshalError } from './marshalError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { ChannelResetError } from '../errors/ChannelResetError.ts';
import { VatNotFoundError } from '../errors/VatNotFoundError.ts';

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

  it('omits the stack when the error has none', () => {
    const error = new Error('foo');
    delete error.stack;
    const marshaledError = marshalError(error);
    expect('stack' in marshaledError).toBe(false);
    expect(marshaledError.message).toBe('foo');
  });

  it('marshals an ocap error without data', () => {
    // ChannelResetError carries no `data`, exercising the ocap-error branch
    // where `error.data` is absent.
    const error = new ChannelResetError();
    const marshaledError = marshalError(error);
    expect(marshaledError.code).toBe(ErrorCode.ChannelResetError);
    expect('data' in marshaledError).toBe(false);
  });
});
