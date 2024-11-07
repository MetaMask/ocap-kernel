import type { Reader, Writer } from '@endo/stream';
import type { Struct } from '@metamask/superstruct';
import {
  any,
  is,
  literal,
  record,
  refine,
  string,
} from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import {
  UnsafeJsonStruct,
  hasProperty,
  isObject,
  object,
} from '@metamask/utils';
import { isMarshaledError, marshalError, unmarshalError } from '@ocap/errors';
import { stringify } from '@ocap/utils';

export type { Reader, Writer };

export type PromiseCallbacks = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const PlainObject = refine(
  record(string(), any()),
  'PlainObject',
  (value) => !Array.isArray(value),
);

export enum StreamSentinel {
  // Not a problem if we don't use the word "Error" in this scope, which we won't.
  // eslint-disable-next-line @typescript-eslint/no-shadow
  Error = '@@StreamError',
  Done = '@@StreamDone',
}

type StreamError = {
  [StreamSentinel.Error]: true;
  error: Json;
};

type StreamDone = {
  [StreamSentinel.Done]: true;
};

export const StreamDoneSymbol = Symbol('StreamDone');

export type StreamSignal = StreamError | StreamDone;

const StreamErrorStruct: Struct<StreamError> = object({
  [StreamSentinel.Error]: literal(true),
  error: PlainObject,
}) as Struct<StreamError>;

const StreamDoneStruct: Struct<StreamDone> = object({
  [StreamSentinel.Done]: literal(true),
});

const isSignalLike = (value: unknown): value is StreamSignal =>
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
export type Writable<Yield extends Json> =
  | Yield
  | Error
  | typeof StreamDoneSymbol;

/**
 * Asserts that a value is a {@link Writable}.
 *
 * @param value - The value to check.
 */
export function assertIsWritable(
  value: unknown,
): asserts value is Writable<Json> {
  if (!is(value, UnsafeJsonStruct) && !(value instanceof Error)) {
    throw new Error(`Invalid writable value: ${String(value)}`);
  }
}

/**
 * A value that can be dispatched to the internal transport mechanism of a stream.
 *
 * @template Yield - The type of the values yielded by the stream.
 */
export type Dispatchable<Yield extends Json> = Yield | StreamSignal;

/**
 * Checks if a value is a {@link Dispatchable}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link Dispatchable}.
 */
export function isDispatchable(value: unknown): value is Dispatchable<Json> {
  return is(value, UnsafeJsonStruct);
}

/**
 * Marshals a {@link Writable} into a {@link Dispatchable}.
 *
 * @param value - The value to marshal.
 * @returns The marshaled value.
 */
export function marshal<Yield extends Json>(
  value: Writable<Yield>,
): Dispatchable<Yield> {
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
export function unmarshal<Yield extends Json>(
  value: Dispatchable<Yield>,
): Writable<Yield> {
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
export const makePendingResult = <Yield extends Json | undefined>(
  value: Yield,
): IteratorResult<Yield, undefined> =>
  harden({
    done: false,
    value,
  });
