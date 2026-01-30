/**
 * Extract a network error code from an error object.
 *
 * Returns error codes like 'ECONNREFUSED', 'ETIMEDOUT', etc., or
 * the error name for libp2p errors, or 'UNKNOWN' for unrecognized errors.
 *
 * @param error - The error to extract the code from.
 * @returns The error code string.
 */
export function getNetworkErrorCode(error: unknown): string {
  const anyError = error as {
    code?: string;
    name?: string;
    message?: string;
  };

  // Node.js network error codes (ECONNREFUSED, ETIMEDOUT, etc.)
  if (typeof anyError?.code === 'string' && anyError.code.length > 0) {
    return anyError.code;
  }

  // libp2p errors and other named errors
  if (typeof anyError?.name === 'string' && anyError.name.length > 0) {
    return anyError.name;
  }

  // Check message for relay reservation errors
  if (
    typeof anyError?.message === 'string' &&
    anyError.message.includes('NO_RESERVATION')
  ) {
    return 'NO_RESERVATION';
  }

  return 'UNKNOWN';
}
