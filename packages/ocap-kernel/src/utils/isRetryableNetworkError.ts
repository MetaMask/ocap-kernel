import { MuxerClosedError } from '@libp2p/interface';

/**
 * Decide if an error is retryable for reconnects
 *
 * @param error - The error to check if it is retryable.
 * @returns True if the error is retryable, false otherwise.
 */
export function isRetryableNetworkError(error: unknown): boolean {
  // Network errors from Node.js (ECONNRESET, ETIMEDOUT, etc.)
  // libp2p errors (Dial*, Transport*, etc.)
  // WebRTC/SCTP errors
  const anyError = error as {
    code?: string;
    name?: string;
    message?: string;
  };

  if (error instanceof MuxerClosedError) {
    return true;
  }

  // Node.js network error codes
  const code = anyError?.code;
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH'
  ) {
    return true;
  }

  // libp2p dial/transport errors
  const name = anyError?.name;
  if (
    typeof name === 'string' &&
    (name.includes('Dial') || name.includes('Transport'))
  ) {
    return true;
  }

  // Relay reservation errors - these are temporary and should be retryable
  const message = anyError?.message;
  if (typeof message === 'string' && message.includes('NO_RESERVATION')) {
    return true;
  }

  return false; // default to non-retryable for unknown errors
}
