import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

/**
 * Error indicating an attempt to create a vat with an ID that already exists.
 */
export class VatAlreadyExistsError extends BaseError {
  /**
   * Creates a new VatAlreadyExistsError.
   *
   * @param vatId - The identifier of the vat that already exists.
   * @param options - Additional error options including cause, stack, and data.
   * @param options.data - Additional data about the error.
   * @param options.data.vatId - The identifier of the vat that already exists.
   * @param options.cause - The underlying error that caused the vat already exists error.
   * @param options.stack - The stack trace of the error.
   */
  constructor(vatId: string, options?: ErrorOptionsWithStack) {
    super(ErrorCode.VatAlreadyExists, 'Vat already exists.', {
      ...options,
      data: { vatId },
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link VatAlreadyExistsError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.VatAlreadyExists),
    data: object({
      vatId: string(),
    }),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link VatAlreadyExistsError}.
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
  ): VatAlreadyExistsError {
    assert(marshaledError, this.struct);
    return new VatAlreadyExistsError(
      marshaledError.data.vatId,
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(VatAlreadyExistsError);
