import {
  assert,
  literal,
  never,
  object,
  optional,
} from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

/**
 * Neutral error indicating a remote peer intentionally disconnected. A netlayer
 * maps its transport-specific intentional-close signal (e.g. a WebRTC SCTP
 * user-initiated abort) onto this so the channel engine can honour the close
 * without reconnecting, and without importing transport error types.
 */
export class IntentionalDisconnectError extends BaseError {
  /**
   * Creates a new IntentionalDisconnectError.
   *
   * @param options - Additional error options including cause and stack.
   * @param options.cause - The underlying transport error that was mapped.
   * @param options.stack - The stack trace of the error.
   */
  constructor(options?: ErrorOptionsWithStack) {
    super(
      ErrorCode.IntentionalDisconnectError,
      'Remote peer intentionally disconnected',
      { ...options },
    );
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link IntentionalDisconnectError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.IntentionalDisconnectError),
    data: optional(never()),
  });

  /**
   * Unmarshals a {@link MarshaledError} into an {@link IntentionalDisconnectError}.
   *
   * @param marshaledError - The marshaled error to unmarshal.
   * @param unmarshalErrorOptions - The function to unmarshal the error options.
   * @returns The unmarshaled error.
   */
  public static unmarshal(
    marshaledError: MarshaledOcapError,
    unmarshalErrorOptions: (
      marshaledError: MarshaledOcapError,
    ) => ErrorOptionsWithStack,
  ): IntentionalDisconnectError {
    assert(marshaledError, this.struct);
    return new IntentionalDisconnectError(
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(IntentionalDisconnectError);
