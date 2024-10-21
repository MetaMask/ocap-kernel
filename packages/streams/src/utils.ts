import type { Reader, Writer } from '@endo/stream';
import type { Struct } from '@metamask/superstruct';
import { boolean, is, optional } from '@metamask/superstruct';
import { UnsafeJsonStruct, object } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import type { MarshaledError } from '@ocap/errors';
import { isMarshaledError, marshalError, unmarshalError } from '@ocap/errors';

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

export type PostMessage = (message: unknown) => void;
export type OnMessage = (event: MessageEvent<unknown>) => void;
