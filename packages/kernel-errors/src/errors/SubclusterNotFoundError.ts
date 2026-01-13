import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

/**
 * Error indicating that a requested subcluster does not exist.
 */
export class SubclusterNotFoundError extends BaseError {
  /**
   * Creates a new SubclusterNotFoundError.
   *
   * @param subclusterId - The identifier of the subcluster that was not found.
   * @param options - Additional error options including cause, stack, and data.
   * @param options.data - Additional data about the error.
   * @param options.data.subclusterId - The identifier of the subcluster that was not found.
   * @param options.cause - The underlying error that caused the subcluster not found error.
   * @param options.stack - The stack trace of the error.
   */
  constructor(subclusterId: string, options?: ErrorOptionsWithStack) {
    super(ErrorCode.SubclusterNotFound, 'Subcluster does not exist.', {
      ...options,
      data: { subclusterId },
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link SubclusterNotFoundError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.SubclusterNotFound),
    data: object({
      subclusterId: string(),
    }),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link SubclusterNotFoundError}.
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
  ): SubclusterNotFoundError {
    assert(marshaledError, this.struct);
    return new SubclusterNotFoundError(
      marshaledError.data.subclusterId,
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(SubclusterNotFoundError);
