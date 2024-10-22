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
    return errorClasses[marshaledError.code].unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
  }

  const { cause, stack } = unmarshalErrorOptions(marshaledError);

  const error = new Error(marshaledError.message, { cause });

  if (stack) {
    error.stack = stack;
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
  const output: ErrorOptionsWithStack = {};

  if (marshaledError.stack) {
    output.stack = marshaledError.stack;
  }

  if (marshaledError.cause) {
    output.cause =
      typeof marshaledError.cause === 'string'
        ? marshaledError.cause
        : unmarshalError(marshaledError.cause);
  }

  return output;
}
