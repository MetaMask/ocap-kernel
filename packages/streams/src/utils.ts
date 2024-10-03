import type { Reader, Writer } from '@endo/stream';
import type { Struct } from '@metamask/superstruct';
import {
  boolean,
  is,
  lazy,
  literal,
  optional,
  string,
} from '@metamask/superstruct';
import { type Json, UnsafeJsonStruct, object } from '@metamask/utils';

export type { Reader, Writer };

export type PromiseCallbacks = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const IteratorResultStruct: Struct<IteratorResult<Json, undefined>> = object({
  done: boolean(),
  value: optional(UnsafeJsonStruct),
}) as Struct<IteratorResult<Json, undefined>>;
// The above cast makes the property optional, which is not strictly correct.
// However, we are unlikely to ever check for the presence of the property, so it
// is unlikely to be a problem in practice.

/**
 * Checks if a value is an {@link IteratorResult}.
 *
 * @param value - The value to check.
 * @returns Whether the value is an {@link IteratorResult}.
 */
const isIteratorResult = (
  value: unknown,
): value is IteratorResult<Json, undefined> => is(value, IteratorResultStruct);

/**
 * A value that can be written to a stream.
 *
 * @template Yield - The type of the values yielded by the iterator.
 */
export type Writable<Yield extends Json> =
  | IteratorResult<Yield, undefined>
  | Error;

/**
 * Asserts that a value is a {@link Writable}.
 *
 * @param value - The value to check.
 */
export function assertIsWritable(
  value: unknown,
): asserts value is Writable<Json> {
  if (!isIteratorResult(value) && !(value instanceof Error)) {
    throw new Error('Invalid writable value: must be IteratorResult or Error.');
  }
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

/**
 * A pair of intertwined streams.
 *
 * @template Read - The type of the values read from the reader.
 * @template Write - The type of the values written to the writer.
 */
export type StreamPair<
  Read extends Json,
  Write extends Json = Read,
> = Readonly<{
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

/**
 * A sentinel value to detect marshaled errors.
 */
export const ErrorSentinel = '@@MARSHALED_ERROR';

/**
 * A marshaled error.
 */
type MarshaledError = {
  [ErrorSentinel]: true;
  message: string;
  stack?: string;
  cause?: MarshaledError;
};

const MarshaledErrorStruct: Struct<MarshaledError> = object({
  [ErrorSentinel]: literal(true),
  message: string(),
  stack: optional(string()),
  cause: optional(lazy(() => MarshaledErrorStruct)),
}) as Struct<MarshaledError>;

/**
 * Checks if a value is a {@link MarshaledError}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link MarshaledError}.
 */
function isMarshaledError(value: unknown): value is MarshaledError {
  return is(value, MarshaledErrorStruct);
}

/**
 * Marshals an error into a {@link MarshaledError}.
 *
 * @param error - The error to marshal.
 * @returns The marshaled error.
 */
export function marshalError(error: Error): MarshaledError {
  const output: MarshaledError = {
    message: error.message,
    [ErrorSentinel]: true,
  };
  if (error.cause && error.cause instanceof Error) {
    output.cause = marshalError(error.cause);
  }
  if (error.stack) {
    output.stack = error.stack;
  }
  return output;
}

/**
 * Unmarshals a {@link MarshaledError} into an {@link Error}.
 *
 * @param marshaledError - The marshaled error to unmarshal.
 * @returns The unmarshaled error.
 */
export function unmarshalError(marshaledError: MarshaledError): Error {
  let output: Error;
  if (marshaledError.cause) {
    output = new Error(marshaledError.message, {
      cause: unmarshalError(marshaledError.cause),
    });
  } else {
    output = new Error(marshaledError.message);
  }

  if (marshaledError.stack) {
    output.stack = marshaledError.stack;
  }
  return output;
}

/**
 * A value that can be dispatched to the internal transport mechanism of a stream.
 *
 * @template Yield - The type of the values yielded by the stream.
 */
export type Dispatchable<Yield extends Json> =
  | IteratorResult<Yield, undefined>
  | MarshaledError;

/**
 * Checks if a value is a {@link Dispatchable}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link Dispatchable}.
 */
export function isDispatchable(value: unknown): value is Dispatchable<Json> {
  return isIteratorResult(value) || isMarshaledError(value);
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
  if (value instanceof Error) {
    return marshalError(value);
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
  if (isMarshaledError(value)) {
    return unmarshalError(value);
  }
  return value;
}
