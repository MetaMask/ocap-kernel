import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

export class VatNotFoundError extends BaseError {
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
