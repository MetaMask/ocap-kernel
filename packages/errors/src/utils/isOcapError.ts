import { BaseError } from '../BaseError.js';

/**
 * Type guard to check if an error is a custom Ocap error (BaseError).
 *
 * @param error - The error to check.
 * @returns `true` if the error is an instance of BaseError.
 */
export function isOcapError(error: Error): error is BaseError {
  return error instanceof BaseError;
}
