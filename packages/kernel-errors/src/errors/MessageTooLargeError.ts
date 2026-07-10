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
 * Neutral error indicating an inbound message exceeded the channel's size
 * limit. A netlayer maps its transport-specific oversize-frame error (e.g.
 * libp2p's `InvalidDataLengthError`) onto this. The length-prefixed framing is
 * poisoned once this fires, so the channel engine treats it as connection loss.
 */
export class MessageTooLargeError extends BaseError {
  /**
   * Creates a new MessageTooLargeError.
   *
   * @param options - Additional error options including cause and stack.
   * @param options.cause - The underlying transport error that was mapped.
   * @param options.stack - The stack trace of the error.
   */
  constructor(options?: ErrorOptionsWithStack) {
    super(
      ErrorCode.MessageTooLargeError,
      'Inbound message exceeds size limit',
      { ...options },
    );
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link MessageTooLargeError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.MessageTooLargeError),
    data: optional(never()),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link MessageTooLargeError}.
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
  ): MessageTooLargeError {
    assert(marshaledError, this.struct);
    return new MessageTooLargeError(unmarshalErrorOptions(marshaledError));
  }
}
harden(MessageTooLargeError);
