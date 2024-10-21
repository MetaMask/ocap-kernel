import { makeErrorMatcherFactory } from '@ocap/test-utils';
import { describe, it, expect } from 'vitest';

import { unmarshalError, unmarshalErrorOptions } from './unmarshalError.js';
import { ErrorCode, ErrorSentinel } from '../constants.js';
import { StreamReadError } from '../errors/StreamReadError.js';
import { VatAlreadyExistsError } from '../errors/VatAlreadyExistsError.js';
import type { OcapError } from '../types.js';
import { isOcapError } from '../utils/isOcapError.js';

const makeErrorMatcher = makeErrorMatcherFactory(expect);

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

  it('should unmarshal an ocap error class', () => {
    const data = { vatId: 'v123' };
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'Vat already exists.',
      stack: 'customStack',
      code: ErrorCode.VatAlreadyExists,
      data,
    } as const;

    const expectedError = new VatAlreadyExistsError(data.vatId);
    expect(() => (expectedError.stack = 'customStack')).toThrow(
      'Cannot assign to read only property',
    );

    const unmarshaledError = unmarshalError(marshaledError) as OcapError;

    expect(unmarshaledError).toStrictEqual(makeErrorMatcher(expectedError));
    expect(isOcapError(unmarshaledError)).toBe(true);
    expect(unmarshaledError.code).toBe(ErrorCode.VatAlreadyExists);
    expect(unmarshaledError.data).toStrictEqual(data);
  });

  it('should unmarshal an ocap error class with a cause', () => {
    const data = { vatId: 'v123' };
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'Unexpected stream read error.',
      stack: 'customStack',
      code: ErrorCode.StreamReadError,
      data,
      cause: {
        [ErrorSentinel]: true,
        message: 'foo',
        stack: 'bar',
      },
    } as const;

    const expectedCauseError = new Error('foo');
    expectedCauseError.stack = 'bar';

    const expectedError = new StreamReadError(data, {
      stack: 'customStack',
      cause: expectedCauseError,
    });
    // since StreamReadError is hardened we cannot modify the stack
    expect(() => (expectedError.stack = 'customStack')).toThrow(
      'Cannot assign to read only property',
    );

    const unmarshaledError = unmarshalError(marshaledError) as OcapError;

    expect(unmarshaledError).toStrictEqual(makeErrorMatcher(expectedError));
    expect(isOcapError(unmarshaledError)).toBe(true);
    expect(unmarshaledError.code).toBe(ErrorCode.StreamReadError);
    expect(unmarshaledError.data).toStrictEqual(data);
  });

  it('should throw if the ocap error class is malformed', () => {
    const invalidMarshaledError = {
      [ErrorSentinel]: true,
      message: 'Vat already exists.',
      stack: 'customStack',
      code: ErrorCode.VatAlreadyExists,
      data: 'invalid data',
    } as const;

    expect(() => unmarshalError(invalidMarshaledError)).toThrow(
      'At path: data -- Expected an object, but received: "invalid data"',
    );
  });

  it('should unmarshal a marshaled error without a stack trace', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'foo',
    } as const;

    expect(unmarshalError(marshaledError)).toStrictEqual(
      makeErrorMatcher(new Error('foo')),
    );
  });

  it('should unmarshal a marshaled error without a cause', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'foo',
      stack: 'bar',
    } as const;

    expect(unmarshalError(marshaledError)).toStrictEqual(
      makeErrorMatcher(new Error('foo')),
    );
  });
});

describe('unmarshalErrorOptions', () => {
  it('should unmarshal error options without cause', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'An error occurred.',
      stack: 'Error stack trace',
    } as const;

    expect(unmarshalErrorOptions(marshaledError)).toStrictEqual({
      stack: 'Error stack trace',
    });
  });

  it('should unmarshal error options with string cause', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'An error occurred.',
      stack: 'Error stack trace',
      cause: 'A string cause',
    } as const;

    expect(unmarshalErrorOptions(marshaledError)).toStrictEqual({
      stack: 'Error stack trace',
      cause: 'A string cause',
    });
  });

  it('should unmarshal error options with nested marshaled error as cause', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'An error occurred.',
      stack: 'Error stack trace',
      cause: {
        [ErrorSentinel]: true,
        message: 'Cause message',
        stack: 'Cause stack trace',
      },
    } as const;

    const expectedCauseError = new Error('Cause message');
    expectedCauseError.stack = 'Cause stack trace';

    expect(unmarshalErrorOptions(marshaledError)).toStrictEqual({
      stack: 'Error stack trace',
      cause: expectedCauseError,
    });
  });

  it('should return default stack when stack is undefined', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'An error occurred.',
    } as const;

    expect(unmarshalErrorOptions(marshaledError)).toStrictEqual({
      stack: '',
    });
  });
});
