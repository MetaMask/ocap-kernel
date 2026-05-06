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
 * Sentinel error thrown by `sendRemoteMessage` when the local side has
 * intentionally closed the connection to a peer. Further messages on this
 * peer must not be retried until reconnectPeer is called.
 */
export class IntentionalCloseError extends BaseError {
  /**
   * Creates a new IntentionalCloseError.
   *
   * @param options - Additional error options including cause and stack.
   * @param options.cause - The underlying error that caused the close.
   * @param options.stack - The stack trace of the error.
   */
  constructor(options?: ErrorOptionsWithStack) {
    super(
      ErrorCode.IntentionalCloseError,
      'Message delivery failed after intentional close',
      { ...options },
    );
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link IntentionalCloseError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.IntentionalCloseError),
    data: optional(never()),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link IntentionalCloseError}.
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
  ): IntentionalCloseError {
    assert(marshaledError, this.struct);
    return new IntentionalCloseError(unmarshalErrorOptions(marshaledError));
  }
}
harden(IntentionalCloseError);
