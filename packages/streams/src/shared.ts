import type { Reader, Writer } from '@endo/stream';
import { hasProperty, isObject } from '@metamask/utils';

export type PromiseCallbacks = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export const isIteratorResult = (
  value: unknown,
): value is IteratorResult<unknown, unknown> =>
  isObject(value) &&
  hasProperty(value, 'done') &&
  typeof value.done === 'boolean' &&
  hasProperty(value, 'value');

export const makeDoneResult = (): { done: true; value: undefined } =>
  harden({
    done: true,
    value: undefined,
  });

export type StreamPair<Read, Write> = Readonly<{
  reader: Reader<Read>;
  writer: Writer<Write>;
  /**
   * Calls `.return()` on both streams.
   */
  return: () => Promise<void>;
  /**
   * Calls `.throw()` on the writer, forwarding the error to the other side. Returns
   * the reader.
   *
   * @param error - The error to forward.
   */
  throw: (error: Error) => Promise<void>;
}>;

export type { Reader, Writer };
