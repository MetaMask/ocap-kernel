import { describe, it, expect } from 'vitest';

import {
  makeAbortableAsyncIterable,
  makeEmptyStreamWithAbort,
  mapAsyncIterable,
  normalizeToAsyncIterable,
} from './utils.ts';

describe('normalizeToAsyncIterable', () => {
  it.each([
    { input: [1, 2, 3], expected: [1, 2, 3] },
    { input: [], expected: [] },
    { input: ['a', 'b'], expected: ['a', 'b'] },
  ])(
    'normalizes array $input to async iterable',
    async ({ input, expected }) => {
      const result = normalizeToAsyncIterable<(typeof input)[number]>(input);
      const values: (typeof input)[number][] = [];
      for await (const value of result) {
        values.push(value);
      }
      expect(values).toStrictEqual(expected);
    },
  );

  it('returns async iterable unchanged', async () => {
    const asyncIter = (async function* () {
      yield 1;
      yield 2;
    })();
    const result = normalizeToAsyncIterable(asyncIter);
    const values: number[] = [];
    for await (const value of result) {
      values.push(value);
    }
    expect(values).toStrictEqual([1, 2]);
  });
});

describe('mapAsyncIterable', () => {
  it.each([
    { input: [1, 2, 3], expected: [false, false, true] },
    { input: [1], expected: [true] },
    { input: ['a', 'b', 'c'], expected: [false, false, true] },
  ])('maps $input with done flag', async ({ input, expected }) => {
    const iterable = (async function* () {
      yield* input;
    })();
    const result = mapAsyncIterable(iterable, (_value, done) => done);
    const values: boolean[] = [];
    for await (const value of result) {
      values.push(value);
    }
    expect(values).toStrictEqual(expected);
  });

  it('maps values correctly', async () => {
    const iterable = (async function* () {
      yield 1;
      yield 2;
    })();
    const result = mapAsyncIterable(iterable, (value, _done) => value * 2);
    const values: number[] = [];
    for await (const value of result) {
      values.push(value);
    }
    expect(values).toStrictEqual([2, 4]);
  });

  it('handles empty iterable', async () => {
    const iterable = (async function* () {
      // Empty iterable for testing
    })();
    const result = mapAsyncIterable(iterable, (_value, done) => done);
    const values: boolean[] = [];
    for await (const value of result) {
      values.push(value);
    }
    expect(values).toStrictEqual([]);
  });
});

describe('makeAbortableAsyncIterable', () => {
  it('yields values until abort', async () => {
    const iterable = (async function* () {
      yield 1;
      yield 2;
      yield 3;
    })();
    const { stream, abort } = makeAbortableAsyncIterable(iterable);
    const values: number[] = [];
    for await (const value of stream) {
      values.push(value);
      if (value === 2) {
        await abort();
      }
    }
    expect(values).toStrictEqual([1, 2]);
  });

  it('stops yielding after abort', async () => {
    const iterable = (async function* () {
      yield 1;
      yield 2;
      yield 3;
    })();
    const { stream, abort } = makeAbortableAsyncIterable(iterable);
    await abort();
    const values: number[] = [];
    for await (const value of stream) {
      values.push(value);
    }
    expect(values).toStrictEqual([]);
  });

  it('completes normally when not aborted', async () => {
    const iterable = (async function* () {
      yield 1;
      yield 2;
    })();
    const { stream } = makeAbortableAsyncIterable(iterable);
    const values: number[] = [];
    for await (const value of stream) {
      values.push(value);
    }
    expect(values).toStrictEqual([1, 2]);
  });
});

describe('makeEmptyStreamWithAbort', () => {
  it('returns empty stream', async () => {
    const { stream } = makeEmptyStreamWithAbort<number>();
    const values: number[] = [];
    for await (const value of stream) {
      values.push(value);
    }
    expect(values).toStrictEqual([]);
  });

  it('provides no-op abort function', async () => {
    const { abort } = makeEmptyStreamWithAbort<number>();
    expect(await abort()).toBeUndefined();
  });
});
