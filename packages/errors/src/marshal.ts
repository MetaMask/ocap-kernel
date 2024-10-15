import { is } from '@metamask/superstruct';

import type { MarshaledError, OcapError } from './types.js';
import { ErrorSentinel, MarshaledErrorStruct } from './types.js';
import { isOcapError } from './utils/isOcapError.js';

/**
 * Checks if a value is a {@link MarshaledError}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link MarshaledError}.
 */
export function isMarshaledError(value: unknown): value is MarshaledError {
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
    [ErrorSentinel]: true,
    message: error.message,
  };

  if (error.cause) {
    output.cause =
      error.cause instanceof Error
        ? marshalError(error.cause)
        : JSON.stringify(error.cause);
  }

  if (error.stack) {
    output.stack = error.stack;
  }

  if (isOcapError(error)) {
    output.code = error.code;
    if (error.data) {
      output.data = JSON.stringify(error.data);
    }
  }

  return output;
}

/**
 * Unmarshals a {@link MarshaledError} into an {@link Error}.
 *
 * @param marshaledError - The marshaled error to unmarshal.
 * @returns The unmarshaled error.
 */
export function unmarshalError(
  marshaledError: MarshaledError,
): Error | OcapError {
  const output = new Error(marshaledError.message);

  if (marshaledError.cause) {
    output.cause =
      typeof marshaledError.cause === 'string'
        ? marshaledError.cause
        : unmarshalError(marshaledError.cause);
  }

  if (marshaledError.stack) {
    output.stack = marshaledError.stack;
  }

  return output;
}
