// @ts-check

import { encodeBase64 } from '@endo/base64';
import { makeExo } from '@endo/exo';
import type { FarRef } from '@endo/far';
import { mapReader } from '@endo/stream';
import type { Reader, Stream } from '@endo/stream';

import { AsyncIteratorInterface } from './interfaces.ts';
import type { SomehowAsyncIterable } from './types.ts';

/**
 * Returns the iterator for the given iterable object.
 * Supports both synchronous and asynchronous iterables.
 *
 * @param iterable - An iterable object.
 * @template Item The item type of the iterable.
 * @returns An async iterator.
 */
export const asyncIterate = <Item>(
  iterable: SomehowAsyncIterable<Item>,
): AsyncIterableIterator<Item> => {
  let iterator: AsyncIterator<Item>;

  if (Symbol.asyncIterator in iterable) {
    iterator = (iterable as AsyncIterable<Item>)[Symbol.asyncIterator]();
  } else if (Symbol.iterator in iterable) {
    iterator = {
      next: async () => (iterable as Iterable<Item>)[Symbol.iterator]().next(),
      [Symbol.asyncIterator]() {
        return this;
      },
    } as AsyncIterator<Item>;
  } else if ('next' in iterable) {
    const syncIterator = iterable as { next: () => IteratorResult<Item> };
    iterator = {
      next: async () => syncIterator.next(),
      [Symbol.asyncIterator]() {
        return this;
      },
    } as AsyncIterator<Item>;
  } else {
    throw new Error('Invalid iterable provided');
  }

  return iterator as AsyncIterableIterator<Item>;
};

/**
 * Creates a reference to an async iterator that can be used across vat boundaries.
 *
 * @param iterable - An iterable object.
 * @template Item The item type of the iterable.
 * @returns A reference to an async iterator.
 */
export const makeIteratorRef = <Item>(
  iterable: SomehowAsyncIterable<Item>,
): FarRef<Reader<Item>> => {
  const iterator = asyncIterate(iterable);

  return makeExo('AsyncIterator', AsyncIteratorInterface, {
    async next(): Promise<IteratorResult<Item>> {
      return iterator.next();
    },

    async return(value?: unknown): Promise<IteratorResult<Item>> {
      if (iterator.return !== undefined) {
        return iterator.return(value);
      }
      return harden({ done: true, value: undefined });
    },

    async throw(error: Error): Promise<IteratorResult<Item>> {
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

/**
 * Creates a reference to a reader that converts a Uint8Array stream to base64 strings.
 *
 * @param readable - A stream of Uint8Arrays.
 * @returns A reader that emits base64 strings.
 */
export const makeReaderRef = (
  readable: SomehowAsyncIterable<Uint8Array>,
): FarRef<Reader<string>> =>
  makeIteratorRef(
    mapReader(
      asyncIterate(readable) as Stream<Uint8Array, string, Uint8Array, string>,
      encodeBase64,
    ),
  );
