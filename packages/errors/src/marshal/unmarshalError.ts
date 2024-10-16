import { isMarshaledOcapError } from './isMarshaledOcapError.js';
import type { BaseError } from '../BaseError.js';
import { errorClasses } from '../errors/index.js';
import type { MarshaledError, OcapError } from '../types.js';

/**
 * Unmarshals a {@link MarshaledError} into an {@link Error}.
 *
 * @param marshaledError - The marshaled error to unmarshal.
 * @returns The unmarshaled error.
 */
export function unmarshalError(
  marshaledError: MarshaledError,
): Error | OcapError {
  let error: Error | OcapError;

  if (isMarshaledOcapError(marshaledError)) {
    error = (errorClasses[marshaledError.code] as typeof BaseError).unmarshal(
      marshaledError,
    );
  } else {
    error = new Error(marshaledError.message);
  }

  if (marshaledError.cause) {
    error.cause =
      typeof marshaledError.cause === 'string'
        ? marshaledError.cause
        : unmarshalError(marshaledError.cause);
  }

  if (marshaledError.stack) {
    error.stack = marshaledError.stack;
  }

  return error;
}
