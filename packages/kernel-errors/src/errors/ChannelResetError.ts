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
 * Neutral error indicating a channel was reset by the remote peer. A netlayer
 * maps its transport-specific reset error (e.g. libp2p's `StreamResetError`)
 * onto this so the channel engine can classify it without importing transport
 * error types. Treated as connection loss (reconnect), never as an intentional
 * close — a malicious peer could otherwise permanently suppress a connection.
 */
export class ChannelResetError extends BaseError {
  /**
   * Creates a new ChannelResetError.
   *
   * @param options - Additional error options including cause and stack.
   * @param options.cause - The underlying transport error that was mapped.
   * @param options.stack - The stack trace of the error.
   */
  constructor(options?: ErrorOptionsWithStack) {
    super(ErrorCode.ChannelResetError, 'Channel reset by remote peer', {
      ...options,
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link ChannelResetError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.ChannelResetError),
    data: optional(never()),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link ChannelResetError}.
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
  ): ChannelResetError {
    assert(marshaledError, this.struct);
    return new ChannelResetError(unmarshalErrorOptions(marshaledError));
  }
}
harden(ChannelResetError);
