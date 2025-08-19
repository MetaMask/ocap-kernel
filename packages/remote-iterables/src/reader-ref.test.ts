import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  asyncIterate,
  makeIteratorRef,
  AsyncIteratorInterface,
} from './reader-ref.ts';
import type { SomehowAsyncIterable } from './reader-ref.ts';

vi.mock('@endo/exo', () => ({
  makeExo: vi.fn((_name, _interfaceObj, methods) => methods),
}));

vi.mock('@endo/patterns', () => ({
  M: {
    interface: vi.fn((name, methods, { defaultGuards }) => ({
      name,
      methods,
      defaultGuards,
    })),
  },
}));

describe('reader-ref', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('asyncIterate', () => {
    it.each([
      {
        name: 'AsyncIterable objects',
        input: {
          [Symbol.asyncIterator]: () => ({
            next: async () => ({ done: false, value: 1 }),
          }),
        },
        expected: { done: false, value: 1 },
      },
      {
        name: 'Iterable objects',
        input: {
          [Symbol.iterator]: () => ({
            next: () => ({ done: false, value: 'test' }),
          }),
        },
        expected: { done: false, value: 'test' },
      },
      {
        name: 'objects with next method',
        input: {
          next: () => ({ done: false, value: true }),
        },
        expected: { done: false, value: true },
      },
      {
        name: 'empty iterables',
        input: {
          [Symbol.iterator]: () => ({
            next: () => ({ done: true, value: undefined }),
          }),
        },
        expected: { done: true, value: undefined },
      },
    ])('should handle $name', async ({ input, expected }) => {
      const iterator = asyncIterate(input as SomehowAsyncIterable<unknown>);
      const result = await iterator.next();

      expect(result).toStrictEqual(expected);
    });

    it('should throw error for non-iterable objects', () => {
      const nonIterable = { foo: 'bar' };

      // @ts-expect-error - destructive test
      expect(() => asyncIterate(nonIterable)).toThrow('Not iterable');
    });

    it('should handle return and throw methods', async () => {
      const returnValue = { done: true, value: 'returned' };
      const error = new Error('Test error');
      const asyncIterable: AsyncIterable<string> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 'test' }),
          return: async () => returnValue,
          throw: async (problem) => ({ done: true, value: problem }),
        }),
      };

      const iterator = asyncIterate(asyncIterable);
      const returnResult = await iterator.return?.('early');
      const throwResult = await iterator.throw?.(error);

      expect(returnResult).toStrictEqual(returnValue);
      expect(throwResult).toStrictEqual({ done: true, value: error });
    });

    it('should handle multiple next() calls', async () => {
      let callCount = 0;
      const asyncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            callCount += 1;
            return { done: callCount > 2, value: callCount };
          },
        }),
      };

      const iterator = asyncIterate(asyncIterable);

      const result1 = await iterator.next();
      const result2 = await iterator.next();
      const result3 = await iterator.next();

      expect(result1).toStrictEqual({ done: false, value: 1 });
      expect(result2).toStrictEqual({ done: false, value: 2 });
      expect(result3).toStrictEqual({ done: true, value: 3 });
    });

    it('should handle errors in iterator methods', async () => {
      const error = new Error('Iterator error');
      const throwError = async () => {
        throw error;
      };
      const asyncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => ({
          next: throwError,
          return: throwError,
          throw: throwError,
        }),
      };

      const iterator = asyncIterate(asyncIterable);

      await expect(iterator.next()).rejects.toThrow('Iterator error');
      await expect(iterator.return?.('early')).rejects.toThrow(
        'Iterator error',
      );
      await expect(iterator.throw?.(error)).rejects.toThrow('Iterator error');
    });
  });

  describe('makeIteratorRef', () => {
    it('should create a far ref for different iterable types', () => {
      const asyncRef = makeIteratorRef({
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 42 }),
        }),
      });

      const syncRef = makeIteratorRef({
        [Symbol.iterator]: () => ({
          next: () => ({ done: false, value: 'hello' }),
        }),
      });

      const nextRef = makeIteratorRef({
        next: () => ({ done: false, value: true }),
      });

      expect(asyncRef).toBeDefined();
      expect(typeof asyncRef.next).toBe('function');
      expect(typeof asyncRef.return).toBe('function');
      expect(typeof asyncRef.throw).toBe('function');
      expect(typeof asyncRef[Symbol.asyncIterator]).toBe('function');

      expect(syncRef).toBeDefined();
      expect(typeof syncRef.next).toBe('function');

      expect(nextRef).toBeDefined();
      expect(typeof nextRef.next).toBe('function');
    });

    it('should handle next() method calls', async () => {
      const asyncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 123 }),
        }),
      };

      const iteratorRef = makeIteratorRef(asyncIterable);
      const result = await iteratorRef.next();

      expect(result).toStrictEqual({ done: false, value: 123 });
    });

    it('should handle return() method calls', async () => {
      const returnValue = { done: true, value: 'returned' };
      const asyncIterable: AsyncIterable<string> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 'test' }),
          return: async () => returnValue,
        }),
      };

      const iteratorRef = makeIteratorRef(asyncIterable);
      const result = await iteratorRef.return('early');

      expect(result).toStrictEqual(returnValue);
    });

    it('should handle return() when iterator lacks return method', async () => {
      const asyncIterable: AsyncIterable<string> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 'test' }),
          // No return method
        }),
      };

      const iteratorRef = makeIteratorRef(asyncIterable);
      const result = await iteratorRef.return('early');

      expect(result).toStrictEqual({ done: true, value: undefined });
    });

    it('should handle throw() method calls', async () => {
      const error = new Error('Test error');
      const asyncIterable: AsyncIterable<string> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 'test' }),
          throw: async (problem) => ({ done: true, value: problem }),
        }),
      };

      const iteratorRef = makeIteratorRef(asyncIterable);
      const result = await iteratorRef.throw(error);

      expect(result).toStrictEqual({ done: true, value: error });
    });

    it('should handle throw() when iterator lacks throw method', async () => {
      const asyncIterable: AsyncIterable<string> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 'test' }),
          // No throw method
        }),
      };

      const iteratorRef = makeIteratorRef(asyncIterable);
      const result = await iteratorRef.throw(new Error('Test error'));

      expect(result).toStrictEqual({ done: true, value: undefined });
    });

    it('should support Symbol.asyncIterator', () => {
      const asyncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 456 }),
        }),
      };

      const iteratorRef = makeIteratorRef(asyncIterable);
      const asyncIterator = iteratorRef[Symbol.asyncIterator]();

      expect(asyncIterator).toBe(iteratorRef);
    });

    it('should handle multiple next() calls', async () => {
      let callCount = 0;
      const asyncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            callCount += 1;
            return { done: callCount > 2, value: callCount };
          },
        }),
      };

      const iteratorRef = makeIteratorRef(asyncIterable);

      const result1 = await iteratorRef.next();
      const result2 = await iteratorRef.next();
      const result3 = await iteratorRef.next();

      expect(result1).toStrictEqual({ done: false, value: 1 });
      expect(result2).toStrictEqual({ done: false, value: 2 });
      expect(result3).toStrictEqual({ done: true, value: 3 });
    });

    it('should handle empty iterables', async () => {
      const emptyIterable: AsyncIterable<never> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true, value: undefined }),
        }),
      };

      const iteratorRef = makeIteratorRef(emptyIterable);
      const result = await iteratorRef.next();

      expect(result).toStrictEqual({ done: true, value: undefined });
    });

    it('should handle errors in iterator methods', async () => {
      const error = new Error('Iterator error');
      const throwError = () => {
        throw error;
      };
      const asyncIterable: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () => ({
          next: throwError,
          return: throwError,
          throw: throwError,
        }),
      };

      const iteratorRef = makeIteratorRef(asyncIterable);

      await expect(iteratorRef.next()).rejects.toThrow('Iterator error');
      await expect(iteratorRef.return('early')).rejects.toThrow(
        'Iterator error',
      );
      await expect(iteratorRef.throw(new Error('Test'))).rejects.toThrow(
        'Iterator error',
      );
    });
  });

  describe('AsyncIteratorInterface', () => {
    it('should be defined with correct properties', () => {
      expect(AsyncIteratorInterface).toBeDefined();
      expect(typeof AsyncIteratorInterface).toBe('object');
      expect('name' in AsyncIteratorInterface).toBe(true);
      expect('defaultGuards' in AsyncIteratorInterface).toBe(true);
      expect(
        (AsyncIteratorInterface as unknown as { name: unknown }).name,
      ).toBe('AsyncIterator');
      expect(
        (AsyncIteratorInterface as unknown as { defaultGuards: unknown })
          .defaultGuards,
      ).toBe('passable');
    });
  });

  describe('SomehowAsyncIterable type', () => {
    it('should accept different iterable types', () => {
      const asyncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 1 }),
        }),
      };

      const iterable: Iterable<string> = {
        [Symbol.iterator]: () => ({
          next: () => ({ done: false, value: 'test' }),
        }),
      };

      const nextOnly: { next: () => IteratorResult<boolean> } = {
        next: () => ({ done: false, value: true }),
      };

      // These should compile without errors
      const _test1: SomehowAsyncIterable<number> = asyncIterable;
      const _test2: SomehowAsyncIterable<string> = iterable;
      const _test3: SomehowAsyncIterable<boolean> = nextOnly;

      expect(_test1).toBeDefined();
      expect(_test2).toBeDefined();
      expect(_test3).toBeDefined();
    });
  });
});
