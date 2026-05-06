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
 * Sentinel error thrown by `sendRemoteMessage` when the transport has been
 * stopped (kernel shutdown). No further sends will succeed; recipients
 * should drain pending state instead of retrying.
 */
export class NetworkStoppedError extends BaseError {
  /**
   * Creates a new NetworkStoppedError.
   *
   * @param options - Additional error options including cause and stack.
   * @param options.cause - The underlying error that caused the network to stop.
   * @param options.stack - The stack trace of the error.
   */
  constructor(options?: ErrorOptionsWithStack) {
    super(ErrorCode.NetworkStoppedError, 'Network stopped', { ...options });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link NetworkStoppedError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.NetworkStoppedError),
    data: optional(never()),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link NetworkStoppedError}.
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
  ): NetworkStoppedError {
    assert(marshaledError, this.struct);
    return new NetworkStoppedError(unmarshalErrorOptions(marshaledError));
  }
}
harden(NetworkStoppedError);
