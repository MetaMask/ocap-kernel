import { makeErrorMatcherFactory } from '@ocap/test-utils';
import { describe, it, expect } from 'vitest';

import { VatNotFoundError } from './errors/VatNotFoundError.js';
import { isMarshaledError, marshalError, unmarshalError } from './marshal.js';
import { ErrorCode, ErrorSentinel } from './types.js';

const makeErrorMatcher = makeErrorMatcherFactory(expect);

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
        data: JSON.stringify({ vatId: 'v1' }),
      }),
    );
  });
});

describe('unmarshalError', () => {
  it('should unmarshal a marshaled error', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'foo',
      stack: 'bar',
    } as const;
    expect(unmarshalError(marshaledError)).toStrictEqual(
      makeErrorMatcher('foo'),
    );
  });

  it('should unmarshal a marshaled error with a cause', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'foo',
      stack: 'bar',
      cause: {
        [ErrorSentinel]: true,
        message: 'baz',
        stack: 'qux',
      },
    } as const;
    expect(unmarshalError(marshaledError)).toStrictEqual(
      makeErrorMatcher(new Error('foo', { cause: new Error('baz') })),
    );
  });

  it('should unmarshal a marshaled error with a string cause', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'foo',
      stack: 'bar',
      cause: 'baz',
    } as const;
    expect(unmarshalError(marshaledError)).toStrictEqual(
      makeErrorMatcher(new Error('foo', { cause: 'baz' })),
    );
  });
});

describe('isMarshaledError', () => {
  it.each([
    [
      'valid marshaled error with required fields only',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
      },
      true,
    ],
    [
      'valid marshaled error with optional fields',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
        code: 'ERROR_CODE',
        data: { key: 'value' },
        stack: 'Error stack trace',
        cause: 'Another error',
      },
      true,
    ],
    [
      'valid marshaled error with nested cause',
      {
        [ErrorSentinel]: true,
        message: 'An error occurred',
        cause: {
          [ErrorSentinel]: true,
          message: 'Nested error occurred',
        },
      },
      true,
    ],
    [
      'object missing the sentinel value',
      {
        message: 'An error occurred',
      },
      false,
    ],
    [
      'object with incorrect sentinel value',
      {
        [ErrorSentinel]: false,
        message: 'An error occurred',
      },
      false,
    ],
    ['null value', null, false],
    ['undefined value', undefined, false],
    ['string value', 'string', false],
    ['number value', 123, false],
    ['array value', [], false],
    [
      'object missing the required message field',
      {
        [ErrorSentinel]: true,
      },
      false,
    ],
  ])('should return %s', (_, value, expected) => {
    expect(isMarshaledError(value)).toBe(expected);
  });
});
