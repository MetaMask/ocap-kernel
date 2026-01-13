import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

/**
 * Error indicating that a requested vat does not exist.
 */
export class VatNotFoundError extends BaseError {
  /**
   * Creates a new VatNotFoundError.
   *
   * @param vatId - The identifier of the vat that was not found.
   * @param options - Additional error options including cause, stack, and data.
   * @param options.data - Additional data about the error.
   * @param options.data.vatId - The identifier of the vat that was not found.
   * @param options.cause - The underlying error that caused the vat not found error.
   * @param options.stack - The stack trace of the error.
   */
  constructor(vatId: string, options?: ErrorOptionsWithStack) {
    super(ErrorCode.VatNotFound, 'Vat does not exist.', {
      ...options,
      data: { vatId },
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link VatNotFoundError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.VatNotFound),
    data: object({
      vatId: string(),
    }),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link VatNotFoundError}.
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
  ): VatNotFoundError {
    assert(marshaledError, this.struct);
    return new VatNotFoundError(
      marshaledError.data.vatId,
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(VatNotFoundError);
