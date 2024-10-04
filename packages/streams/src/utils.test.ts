import type { Json } from '@metamask/utils';
import { makeErrorMatcherFactory } from '@ocap/test-utils';
import { describe, expect, it } from 'vitest';

import type { Dispatchable } from './utils.js';
import {
  assertIsWritable,
  ErrorSentinel,
  isDispatchable,
  makeDoneResult,
  makePendingResult,
  marshal,
  marshalError,
  unmarshal,
  unmarshalError,
} from './utils.js';
import { stringify } from '@ocap/utils';

const makeErrorMatcher = makeErrorMatcherFactory(expect);

describe('assertIsWritable', () => {
  it.each([
    ['pending result with string', makePendingResult('foo')],
    ['pending result with number', makePendingResult(42)],
    ['pending result with object', makePendingResult({ key: 'value' })],
    ['pending result with null', makePendingResult(null)],
    ['pending result with undefined', makePendingResult(undefined)],
    ['Error', new Error('foo')],
    ['TypeError', new TypeError('type error')],
    ['RangeError', new RangeError('range error')],
  ])('should pass if the value is a Writable: %s', (_, value) => {
    expect(() => assertIsWritable(value)).not.toThrow();
  });

  it.each([
    ['string', 'string'],
    ['number', 42],
    ['boolean', true],
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['empty array', []],
    ['function', () => undefined],
    ['symbol', Symbol('symbol')],
  ])('should throw if the value is not a Writable: %s', (_, value) => {
    expect(() => assertIsWritable(value)).toThrow(
      'Invalid writable value: must be IteratorResult or Error.',
    );
  });
});

describe('isDispatchable', () => {
  it.each([
    ['IteratorResult (done)', makeDoneResult()],
    ['IteratorResult (pending)', makePendingResult('test')],
    ['MarshaledError', marshalError(new Error('test'))],
  ])('should return true for a dispatchable value: %s', (_, dispatchable) => {
    expect(isDispatchable(dispatchable)).toBe(true);
  });

  it.each([
    ['Error', new Error('foo')],
    ['string', 'not dispatchable'],
    ['number', 42],
    ['object', { foo: 'bar' }],
    ['null', null],
    ['undefined', undefined],
  ])(
    'should return false for a non-dispatchable value: %s',
    (_, nonDispatchable) => {
      expect(isDispatchable(nonDispatchable)).toBe(false);
    },
  );
});

describe('makeDoneResult', () => {
  it('should create a frozen done result', () => {
    const result = makeDoneResult();
    expect(result).toStrictEqual({ done: true, value: undefined });
    expect(globalThis.harden).toHaveBeenCalledWith(makeDoneResult());
  });
});

describe('makePendingResult', () => {
  it('should create a frozen pending result', () => {
    const result = makePendingResult(42);
    expect(result).toStrictEqual({ done: false, value: 42 });
    expect(globalThis.harden).toHaveBeenCalledWith(makePendingResult(42));
  });
});

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
        cause: stringify(cause),
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

describe('marshal', () => {
  it.each([
    ['pending result with string', makePendingResult('foo')],
    ['pending result with number', makePendingResult(42)],
    ['pending result with boolean', makePendingResult(true)],
    ['pending result with null', makePendingResult(null)],
    ['pending result with array', makePendingResult([1, 2, 3])],
    ['pending result with object', makePendingResult({ a: 1, b: 2 })],
    ['done result', makeDoneResult()],
  ] as [string, IteratorResult<Json, undefined>][])(
    'should marshal a %s value',
    (_, value) => {
      const marshaledValue = marshal(value);
      expect(marshaledValue).toStrictEqual(value);
    },
  );

  it('should marshal an error', () => {
    const error = new Error('test error');
    const marshaledValue = marshal(error);
    expect(marshaledValue).toStrictEqual(
      expect.objectContaining({
        [ErrorSentinel]: true,
        message: 'test error',
        stack: expect.any(String),
      }),
    );
  });
});

describe('unmarshal', () => {
  it.each([
    ['pending result with string', makePendingResult('foo')],
    ['pending result with number', makePendingResult(42)],
    ['pending result with boolean', makePendingResult(true)],
    ['pending result with null', makePendingResult(null)],
    ['pending result with array', makePendingResult([1, 2, 3])],
    ['pending result with object', makePendingResult({ a: 1, b: 2 })],
    ['done result', makeDoneResult()],
  ] as [string, IteratorResult<Json, undefined>][])(
    'should unmarshal a %s value',
    (_, value) => {
      const unmarshaledValue = unmarshal(value);
      expect(unmarshaledValue).toStrictEqual(value);
    },
  );

  it('should unmarshal a marshaled error', () => {
    const marshaledError: Dispatchable<Json> = {
      [ErrorSentinel]: true,
      message: 'foo',
      stack: 'bar',
    };
    const unmarshaledValue = unmarshal(marshaledError);
    expect(unmarshaledValue).toStrictEqual(makeErrorMatcher('foo'));
  });
});
