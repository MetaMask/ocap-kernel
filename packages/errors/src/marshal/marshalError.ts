import type { MarshaledError } from '../types.js';
import { ErrorSentinel } from '../types.js';
import { isOcapError } from '../utils/isOcapError.js';

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
