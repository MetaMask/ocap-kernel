import { isMarshaledOcapError } from './isMarshaledOcapError.js';
import { errorClasses } from '../errors/index.js';
import type {
  ErrorOptionsWithStack,
  MarshaledError,
  OcapError,
} from '../types.js';

/**
 * Unmarshals a {@link MarshaledError} into an {@link Error}.
 *
 * @param marshaledError - The marshaled error to unmarshal.
 * @returns The unmarshaled error.
 */
export function unmarshalError(
  marshaledError: MarshaledError,
): Error | OcapError {
  if (isMarshaledOcapError(marshaledError)) {
    return errorClasses[marshaledError.code].unmarshal(marshaledError);
  }

  let cause;
  if (marshaledError.cause) {
    cause =
      typeof marshaledError.cause === 'string'
        ? marshaledError.cause
        : unmarshalError(marshaledError.cause);
  }

  const error = new Error(marshaledError.message, { cause });

  if (marshaledError.stack) {
    error.stack = marshaledError.stack;
  }

  return error;
}

/**
 * Gets the error options from a marshaled error.
 *
 * @param marshaledError - The marshaled error to get the options from.
 * @returns The error options.
 */
export function unmarshalErrorOptions(
  marshaledError: MarshaledError,
): ErrorOptionsWithStack {
  const output: ErrorOptionsWithStack = { stack: marshaledError.stack ?? '' };

  if (marshaledError.cause) {
    output.cause =
      typeof marshaledError.cause === 'string'
        ? new Error(marshaledError.cause)
        : unmarshalError(marshaledError.cause);
  }

  return output;
}
