import { decodeBase64 } from '@endo/base64';
import { makeExo } from '@endo/exo';
import { E } from '@endo/far';
import type { ERef } from '@endo/far';
import { mapReader } from '@endo/stream';
import type { Stream } from '@endo/stream';

import { AsyncIteratorInterface } from './interfaces.ts';

/**
 * Creates a reference to an async iterator that can be used across vat boundaries.
 *
 * @param iteratorRef - A reference to an async iterator.
 * @template TValue The type of the values in the iterator.
 * @template TReturn The type of the return value of the iterator.
 * @template TNext The type of the next value of the iterator.
 * @returns A reference to an async iterator.
 */
export const makeRefIterator = <TValue>(
  iteratorRef: ERef<Stream<TValue>>,
): Stream<TValue> => {
  const iterator = makeExo('AsyncIterator', AsyncIteratorInterface, {
    async next(value: undefined): Promise<IteratorResult<TValue>> {
      return E(iteratorRef).next(value);
    },

    async return(value: undefined): Promise<IteratorResult<TValue>> {
      return E(iteratorRef).return(value);
    },

    async throw(error: Error): Promise<IteratorResult<TValue>> {
      return E(iteratorRef).throw(error);
    },

    [Symbol.asyncIterator]() {
      return this;
    },
  });

  return iterator;
};

/**
 * Creates a reference to a reader that can be used across vat boundaries.
 *
 * @param readerRef - A reference to a reader.
 * @returns A reference to a reader.
 */
export const makeRefReader = (
  readerRef: ERef<Stream<string>>,
): AsyncIterableIterator<Uint8Array> =>
  mapReader(makeRefIterator(readerRef), decodeBase64);
