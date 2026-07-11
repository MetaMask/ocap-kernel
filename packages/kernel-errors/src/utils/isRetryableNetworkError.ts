import { ChannelResetError } from '../errors/ChannelResetError.ts';

/**
 * Decide if an error is retryable for reconnects.
 *
 * This is the transport-neutral classifier: it recognises the neutral error
 * classes a netlayer maps its transport failures to, plus the standard Node.js
 * network error codes. Transport-specific error sniffing (e.g. libp2p's
 * `MuxerClosedError`/`Dial`/`Transport`/`NO_RESERVATION`) lives in the
 * respective netlayer's error mapper, which maps such errors to neutral classes
 * before they reach the transport-neutral engine.
 *
 * @param error - The error to check if it is retryable.
 * @returns True if the error is retryable, false otherwise.
 */
export function isRetryableNetworkError(error: unknown): boolean {
  // A reset the netlayer already mapped to a neutral class.
  if (error instanceof ChannelResetError) {
    return true;
  }

  // Node.js network error codes.
  // Note: ENOTFOUND (DNS lookup failed) is included to allow permanent failure
  // detection to work - after multiple consecutive ENOTFOUND errors, the peer
  // will be marked as permanently failed rather than giving up immediately.
  const code = (error as { code?: string })?.code;
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    code === 'ENOTFOUND'
  ) {
    return true;
  }

  return false; // default to non-retryable for unknown errors
}
