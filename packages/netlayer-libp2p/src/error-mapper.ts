import { StreamResetError } from '@libp2p/interface';
import {
  InvalidDataLengthError,
  InvalidDataLengthLengthError,
} from '@libp2p/utils';
import {
  ChannelResetError,
  IntentionalDisconnectError,
  isRetryableNetworkError,
  MessageTooLargeError,
} from '@metamask/kernel-errors';

import { SCTP_USER_INITIATED_ABORT } from './constants.ts';

/**
 * Detect whether a read error indicates an intentional disconnect. Checks the
 * legacy SCTP sniffing for a WebRTC user-initiated abort (code 12). The typed
 * `StreamResetError` is handled separately (mapped to `ChannelResetError`) so a
 * remote reset always reconnects and is never treated as intentional.
 *
 * @param problem - The error thrown by a stream read.
 * @returns Whether the error represents an intentional disconnect.
 */
export function isIntentionalDisconnect(problem: unknown): boolean {
  const rtcProblem = problem as {
    errorDetail?: string;
    sctpCauseCode?: number;
  };
  return (
    rtcProblem?.errorDetail === 'sctp-failure' &&
    rtcProblem?.sctpCauseCode === SCTP_USER_INITIATED_ABORT
  );
}

/**
 * Map a raw libp2p stream-read error onto a neutral kernel-error so the channel
 * engine never imports libp2p error types. Ordering mirrors the historical
 * engine cascade: a `StreamResetError` maps to `ChannelResetError` (reconnect)
 * before intentional-disconnect classification, so a remote reset can never be
 * swallowed as an intentional close. Anything unrecognised (including
 * `UnexpectedEOFError`) passes through unchanged for the engine's else branch.
 *
 * @param problem - The raw error thrown by the underlying stream read.
 * @returns The neutral error to throw, or the original error unchanged.
 */
export function mapLibp2pReadError(problem: unknown): unknown {
  if (
    problem instanceof InvalidDataLengthError ||
    problem instanceof InvalidDataLengthLengthError
  ) {
    return new MessageTooLargeError({ cause: problem });
  }
  if (problem instanceof StreamResetError) {
    return new ChannelResetError({ cause: problem });
  }
  if (isIntentionalDisconnect(problem)) {
    return new IntentionalDisconnectError({ cause: problem as Error });
  }
  return problem;
}

/**
 * Classify a raw libp2p error by name/message as a retryable dial-path failure.
 * These are the libp2p-specific branches that used to live in kernel-errors'
 * `isRetryableNetworkError`; they are matched by string (no libp2p import for
 * the check itself) and catch raw libp2p dial errors before they are mapped to
 * neutral classes.
 *
 * @param error - The error to classify.
 * @returns Whether the error is a retryable libp2p dial-path failure.
 */
function isRetryableLibp2pName(error: unknown): boolean {
  const anyError = error as { name?: string; message?: string };

  // Yamux muxer teardown mid-dial — retry against other addresses/relays.
  if (error instanceof Error && error.name === 'MuxerClosedError') {
    return true;
  }

  // libp2p dial/transport errors (DialError, TransportError, etc.).
  const { name } = anyError;
  if (
    typeof name === 'string' &&
    (name.includes('Dial') || name.includes('Transport'))
  ) {
    return true;
  }

  // Relay reservation errors are temporary and should be retried.
  const { message } = anyError;
  if (typeof message === 'string' && message.includes('NO_RESERVATION')) {
    return true;
  }

  return false;
}

/**
 * Decide whether a raw libp2p connection error is retryable. Composes the
 * neutral {@link isRetryableNetworkError} (neutral error classes + Node.js
 * network error codes) with the libp2p-specific name/message sniffing so the
 * provider's own backoff loop keeps its historical behavior.
 *
 * @param error - The error to classify.
 * @returns Whether the error is retryable.
 */
export function isRetryableLibp2pError(error: unknown): boolean {
  return isRetryableNetworkError(error) || isRetryableLibp2pName(error);
}

/**
 * Map a raw libp2p dial error onto a neutral kernel-error so the transport-
 * neutral channel engine classifies reconnection identically without knowing
 * any libp2p error types.
 *
 * Errors the neutral classifier already recognises (neutral classes and Node.js
 * network codes) pass through unchanged, preserving the engine's permanent-
 * failure detection (which keys on Node.js codes). libp2p-specific retryable
 * errors are wrapped in a neutral, retryable {@link ChannelResetError}; because
 * libp2p error names were never members of the permanent-failure code set (and
 * neither is `ChannelResetError`), this does not change give-up behavior.
 * Everything else passes through so the engine gives up exactly as before.
 *
 * @param problem - The raw error thrown by the libp2p dial path.
 * @returns The neutral error to throw, or the original error unchanged.
 */
export function mapLibp2pDialError(problem: unknown): unknown {
  if (isRetryableNetworkError(problem)) {
    return problem;
  }
  if (isRetryableLibp2pName(problem)) {
    return new ChannelResetError({ cause: problem as Error });
  }
  return problem;
}
