import { stringify } from '@metamask/kernel-utils';
import { makeErrorMatcherFactory } from '@ocap/test-utils';
import { describe, expect, it } from 'vitest';

import type { Dispatchable, Writable } from './utils.ts';
import {
  makeDoneResult,
  makePendingResult,
  makeStreamDoneSignal,
  makeStreamErrorSignal,
  marshal,
  StreamDoneSymbol,
  StreamSentinel,
  unmarshal,
} from './utils.ts';

const makeErrorMatcher = makeErrorMatcherFactory(expect);

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
    ['Symbol', Symbol('foo')],
  ] as [string, Writable<unknown>, Dispatchable<unknown> | undefined][])(
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
    ['Symbol', Symbol('foo')],
  ] as [string, Dispatchable<unknown>, Writable<unknown> | undefined][])(
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
