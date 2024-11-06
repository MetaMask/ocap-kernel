import type { Json } from '@metamask/utils';
import { makeErrorMatcherFactory } from '@ocap/test-utils';
import { stringify } from '@ocap/utils';
import { describe, expect, it } from 'vitest';

import type { Dispatchable, Writable } from './utils.js';
import {
  assertIsWritable,
  isDispatchable,
  makeDoneResult,
  makePendingResult,
  makeStreamDoneSignal,
  makeStreamErrorSignal,
  marshal,
  StreamDoneSymbol,
  StreamSentinel,
  unmarshal,
} from './utils.js';

const makeErrorMatcher = makeErrorMatcherFactory(expect);

describe('assertIsWritable', () => {
  it.each([
    ['string', 'foo'],
    ['number', 42],
    ['object', { key: 'value' }],
    ['null', null],
    ['Error', new Error('foo')],
    ['TypeError', new TypeError('type error')],
    ['RangeError', new RangeError('range error')],
  ])('should pass if the value is a Writable: %s', (_, value) => {
    expect(() => assertIsWritable(value)).not.toThrow();
  });

  it.each([
    ['undefined', undefined],
    ['function', () => undefined],
    ['symbol', Symbol('symbol')],
  ])('should throw if the value is not a Writable: %s', (_, value) => {
    expect(() => assertIsWritable(value)).toThrow(
      `Invalid writable value: ${String(value)}`,
    );
  });
});

describe('isDispatchable', () => {
  it.each([
    ['string', 'foo'],
    ['number', 42],
    ['object', { foo: 'bar' }],
    ['null', null],
    ['StreamDoneSignal', makeStreamDoneSignal()],
    ['StreamErrorSignal', makeStreamErrorSignal(new Error('foo'))],
  ])('should return true for a dispatchable value: %s', (_, dispatchable) => {
    expect(isDispatchable(dispatchable)).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['function', () => undefined],
    ['symbol', Symbol('symbol')],
  ])(
    'should return false for a non-dispatchable value: %s',
    (_, nonDispatchable) => {
      expect(isDispatchable(nonDispatchable)).toBe(false);
    },
  );
});

describe('marshal', () => {
  it.each([
    ['StreamDoneSymbol', StreamDoneSymbol, makeStreamDoneSignal()],
    [
      'Error',
      new Error('foo'),
      {
        [StreamSentinel.Error]: true,
        error: makeErrorMatcher('foo'),
      },
    ],
    ['number', 42],
    ['string', 'foo'],
    ['object', { foo: 'bar' }],
    ['array', [1, 2, 3]],
    ['null', null],
  ] as [string, Writable<Json>, Dispatchable<Json> | undefined][])(
    'should marshal a %s value',
    (_, value, expected) => {
      const marshaledValue = marshal(value);
      expect(marshaledValue).toStrictEqual(expected ?? value);
    },
  );
});

describe('unmarshal', () => {
  it.each([
    ['StreamDoneSignal', makeStreamDoneSignal(), StreamDoneSymbol],
    ['Error', makeStreamErrorSignal(new Error('foo')), new Error('foo')],
    ['number', 42],
    ['string', 'foo'],
    ['object', { foo: 'bar' }],
    ['array', [1, 2, 3]],
    ['null', null],
  ] as [string, Dispatchable<Json>, Writable<Json> | undefined][])(
    'should unmarshal a %s value',
    (_, value, expected) => {
      const unmarshaledValue = unmarshal(value);
      expect(unmarshaledValue).toStrictEqual(expected ?? value);
    },
  );

  it('throws if the value is not a valid stream signal', () => {
    const badSignal = { [StreamSentinel.Error]: true, error: 'foo' };
    expect(() => unmarshal(badSignal)).toThrow(
      `Invalid stream signal: ${stringify(badSignal)}`,
    );
  });
});

describe('makeDoneResult', () => {
  it('should create a frozen done result', () => {
    const result = makeDoneResult();
    expect(result).toStrictEqual({ done: true, value: undefined });
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe('makePendingResult', () => {
  it('should create a frozen pending result', () => {
    const result = makePendingResult(42);
    expect(result).toStrictEqual({ done: false, value: 42 });
    expect(Object.isFrozen(result)).toBe(true);
  });
});
