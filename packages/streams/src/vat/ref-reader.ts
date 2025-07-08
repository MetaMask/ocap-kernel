import { E } from '@endo/far';
import type { ERef } from '@endo/far';

/**
 * @param iteratorRef - The iterator ref to make an iterator from.
 * @returns An iterator that wraps the iterator ref.
 */
export const makeRefIterator = <TValue, TReturn, TNext>(
  iteratorRef: ERef<AsyncIterator<TValue, TReturn, TNext>>,
): AsyncIterator<TValue, TReturn, TNext> & {
  [Symbol.asyncIterator]: () => AsyncIterator<TValue, TReturn, TNext>;
} => {
  const iterator = {
    next: async (...args: [TNext] | []) => E(iteratorRef).next(...args),
    return: async (...args: [TReturn] | []) => E(iteratorRef).return(...args),
    throw: async (error: unknown) => E(iteratorRef).throw(error),
    [Symbol.asyncIterator]: () => iterator,
  };
  return iterator;
};
