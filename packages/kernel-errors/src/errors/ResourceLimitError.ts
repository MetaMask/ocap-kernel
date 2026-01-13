import {
  assert,
  literal,
  number,
  object,
  optional,
  union,
} from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

/**
 * Error indicating a resource limit was exceeded.
 */
export class ResourceLimitError extends BaseError {
  /**
   * Creates a new ResourceLimitError.
   *
   * @param message - A human-readable description of the error.
   * @param options - Additional error options including cause and stack.
   */
  constructor(
    message: string,
    options?: ErrorOptionsWithStack & {
      data?: {
        limitType?: 'connection' | 'messageSize';
        current?: number;
        limit?: number;
      };
    },
  ) {
    super(ErrorCode.ResourceLimitError, message, {
      ...options,
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link ResourceLimitError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.ResourceLimitError),
    data: optional(
      object({
        limitType: optional(
          union([literal('connection'), literal('messageSize')]),
        ),
        current: optional(number()),
        limit: optional(number()),
      }),
    ),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link ResourceLimitError}.
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
  ): ResourceLimitError {
    assert(marshaledError, this.struct);
    const options = unmarshalErrorOptions(marshaledError);
    const data = marshaledError.data as
      | {
          limitType?: 'connection' | 'messageSize';
          current?: number;
          limit?: number;
        }
      | undefined;
    return new ResourceLimitError(marshaledError.message, {
      ...options,
      ...(data !== undefined && { data }),
    });
  }
}
harden(ResourceLimitError);
