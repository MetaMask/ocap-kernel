import { makeExo } from '@endo/exo';
import type { FarRef } from '@endo/far';
import { M } from '@endo/patterns';

export const AsyncIteratorInterface = M.interface(
  'AsyncIterator',
  {},
  {
    defaultGuards: 'passable',
  },
);

export type SomehowAsyncIterable<Item> =
  | AsyncIterable<Item>
  | Iterable<Item>
  | { next: () => IteratorResult<Item> };

/**
 * Returns the iterator for the given iterable object.
 * Supports both synchronous and asynchronous iterables.
 *
 * @param iterable - The iterable object.
 * @returns The iterator for the given iterable object.
 */
export const asyncIterate = <Item>(
  iterable: SomehowAsyncIterable<Item>,
): AsyncIterator<Item> => {
  let iterator;
  if (iterable[Symbol.asyncIterator as keyof typeof iterable]) {
    iterator = (iterable as AsyncIterable<Item>)[Symbol.asyncIterator]();
  } else if (iterable[Symbol.iterator as keyof typeof iterable]) {
    iterator = (iterable as Iterable<Item>)[Symbol.iterator]();
  } else if ('next' in iterable) {
    iterator = iterable;
  } else {
    throw new Error('Not iterable');
  }
  return iterator as AsyncIterator<Item>;
};

/**
 * Make a remotable AsyncIterator.
 *
 * @param iterable - The iterable object.
 * @returns A FarRef for the iterator.
 */
export const makeIteratorRef = <Item>(
  iterable: SomehowAsyncIterable<Item>,
): FarRef<AsyncIterator<Item>> & {
  next: () => Promise<IteratorResult<Item>>;
  return: (value: Item) => Promise<IteratorResult<Item>>;
  throw: (error: unknown) => Promise<IteratorResult<Item>>;
  [Symbol.asyncIterator]: () => AsyncIterator<Item>;
} => {
  const iterator = asyncIterate(iterable);
  // @ts-expect-error while switching from Far
  return makeExo('AsyncIterator', AsyncIteratorInterface, {
    async next() {
      return iterator.next(undefined);
    },
    /**
     * Finish the iterator without error.
     *
     * @param value - The value to return.
     * @returns The result of the return operation.
     */
    async return(value: Item): Promise<IteratorResult<Item>> {
      if (iterator.return !== undefined) {
        return iterator.return(value);
      }
      return harden({ done: true, value: undefined });
    },
    /**
     * Finish the iterator with an error.
     *
     * @param error - The error to throw.
     * @returns The result of the throw operation.
     */
    async throw(error: unknown) {
      if (iterator.throw !== undefined) {
        return iterator.throw(error);
      }
      return harden({ done: true, value: undefined });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });
};
