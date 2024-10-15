import { makeErrorMatcherFactory } from '@ocap/test-utils';
import { describe, it, expect } from 'vitest';

import { unmarshalError } from './unmarshalError.js';
import { ErrorSentinel } from '../types.js';

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
});
