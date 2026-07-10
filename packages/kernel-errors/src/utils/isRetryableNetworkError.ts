import { ChannelResetError } from '../errors/ChannelResetError.ts';

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

  // A read-path reset the netlayer already mapped to a neutral class.
  if (error instanceof ChannelResetError) {
    return true;
  }

  // The MuxerClosedError / Dial / Transport / NO_RESERVATION branches below are
  // libp2p-specific and matched by name/message (no libp2p import). They catch
  // raw libp2p dial-path errors that surface before the netlayer maps them, and
  // move to @metamask/netlayer-libp2p's error mapper in Phase 4 of the netlayer
  // work.
  if (error instanceof Error && error.name === 'MuxerClosedError') {
    return true;
  }

  // Node.js network error codes
  // Note: ENOTFOUND (DNS lookup failed) is included to allow permanent failure
  // detection to work - after multiple consecutive ENOTFOUND errors, the peer
  // will be marked as permanently failed rather than giving up immediately.
  const code = anyError?.code;
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
