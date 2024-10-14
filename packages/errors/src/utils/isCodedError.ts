type CodedError = {
  code: string | number;
} & Error;

/**
 * Checks if an error has a code.
 *
 * @param error - The error to check.
 * @returns Whether the error has a code.
 */
export function isCodedError(error: Error): error is CodedError {
  return (
    error instanceof Error &&
    'code' in error &&
    (typeof error.code === 'string' || typeof error.code === 'number')
  );
}
