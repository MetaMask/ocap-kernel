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
