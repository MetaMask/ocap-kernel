import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

/**
 * Error indicating an operation was attempted on a vat that has been deleted.
 */
export class VatDeletedError extends BaseError {
  /**
   * Creates a new VatDeletedError.
   *
   * @param vatId - The identifier of the deleted vat.
   * @param options - Additional error options including cause and stack trace.
   */
  constructor(vatId: string, options?: ErrorOptionsWithStack) {
    super(ErrorCode.VatDeleted, 'Vat was deleted.', {
      ...options,
      data: { vatId },
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link VatDeletedError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.VatDeleted),
    data: object({
      vatId: string(),
    }),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link VatDeletedError}.
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
  ): VatDeletedError {
    assert(marshaledError, this.struct);
    return new VatDeletedError(
      marshaledError.data.vatId,
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(VatDeletedError);
