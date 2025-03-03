import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

export class VatAlreadyExistsError extends BaseError {
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
