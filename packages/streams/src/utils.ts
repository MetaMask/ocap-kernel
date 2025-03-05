import type { Reader, Writer } from '@endo/stream';
import type { Infer } from '@metamask/superstruct';
import { is, literal } from '@metamask/superstruct';
import {
  hasProperty,
  isObject,
  object,
  UnsafeJsonStruct,
} from '@metamask/utils';
import { isMarshaledError, marshalError, unmarshalError } from '@ocap/errors';
import { stringify } from '@ocap/utils';

export type { Reader, Writer };

export const StreamSentinel = {
  Error: '@@StreamError',
  Done: '@@StreamDone',
} as const;

export const StreamDoneSymbol = Symbol('StreamDone');

const StreamDoneStruct = object({
  [StreamSentinel.Done]: literal(true),
});

const StreamErrorStruct = object({
  [StreamSentinel.Error]: literal(true),
  error: UnsafeJsonStruct,
});

type StreamDone = Infer<typeof StreamDoneStruct>;

type StreamError = Infer<typeof StreamErrorStruct>;

export type StreamSignal = StreamError | StreamDone;

export const isSignalLike = (value: unknown): value is StreamSignal =>
  isObject(value) &&
  (hasProperty(value, StreamSentinel.Error) ||
    hasProperty(value, StreamSentinel.Done));

export const makeStreamErrorSignal = (error: Error): StreamError => ({
  [StreamSentinel.Error]: true,
  error: marshalError(error),
});

export const makeStreamDoneSignal = (): StreamDone => ({
  [StreamSentinel.Done]: true,
});

/**
 * A value that can be written to a stream.
 *
 * @template Yield - The type of the values yielded by the iterator.
 */
export type Writable<Yield> = Yield | Error | typeof StreamDoneSymbol;

/**
 * A value that can be dispatched to the internal transport mechanism of a stream.
 *
 * @template Yield - The type of the values yielded by the stream.
 */
export type Dispatchable<Yield> = Yield | StreamSignal;

/**
 * Marshals a {@link Writable} into a {@link Dispatchable}.
 *
 * @param value - The value to marshal.
 * @returns The marshaled value.
 */
export function marshal<Yield>(value: Writable<Yield>): Dispatchable<Yield> {
  if (value === StreamDoneSymbol) {
    return { [StreamSentinel.Done]: true };
  }
  if (value instanceof Error) {
    return {
      [StreamSentinel.Error]: true,
      error: marshalError(value),
    };
  }
  return value;
}

/**
 * Unmarshals a {@link Dispatchable} into a {@link Writable}.
 *
 * @param value - The value to unmarshal.
 * @returns The unmarshaled value.
 */
export function unmarshal<Yield>(value: Dispatchable<Yield>): Writable<Yield> {
  if (isSignalLike(value)) {
    if (is(value, StreamDoneStruct)) {
      return StreamDoneSymbol;
    }
    if (is(value, StreamErrorStruct) && isMarshaledError(value.error)) {
      return unmarshalError(value.error);
    }
    throw new Error(`Invalid stream signal: ${stringify(value)}`);
  }
  return value;
}

/**
 * Creates a {@link IteratorResult} with `{ done: true, value: undefined }`.
 *
 * @template Yield - The type of the values yielded by the iterator.
 * @returns A {@link IteratorResult} with `{ done: true, value: undefined }`.
 */
export const makeDoneResult = <Yield>(): IteratorResult<Yield, undefined> =>
  harden({
    done: true,
    value: undefined,
  });

/**
 * Creates a {@link IteratorResult} with `{ done: false, value }`.
 *
 * @template Yield - The type of the values yielded by the iterator.
 * @param value - The value of the iterator result.
 * @returns A {@link IteratorResult} with `{ done: false, value }`.
 */
export const makePendingResult = <Yield>(
  value: Yield,
): IteratorResult<Yield, undefined> =>
  harden({
    done: false,
    value,
  });
