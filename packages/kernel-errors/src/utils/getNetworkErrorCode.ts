/**
 * Extract a network error code from an error object.
 *
 * Returns error codes like 'ECONNREFUSED', 'ETIMEDOUT', etc., or the error name
 * for any named error, or 'UNKNOWN' for unrecognized errors. This is used by
 * the transport-neutral engine for permanent-failure pattern detection, which
 * keys on Node.js network codes; transport-specific error sniffing lives in the
 * netlayer error mappers.
 *
 * @param error - The error to extract the code from.
 * @returns The error code string.
 */
export function getNetworkErrorCode(error: unknown): string {
  const anyError = error as {
    code?: string;
    name?: string;
  };

  // Node.js network error codes (ECONNREFUSED, ETIMEDOUT, etc.)
  if (typeof anyError?.code === 'string' && anyError.code.length > 0) {
    return anyError.code;
  }

  // Any named error.
  if (typeof anyError?.name === 'string' && anyError.name.length > 0) {
    return anyError.name;
  }

  return 'UNKNOWN';
}
