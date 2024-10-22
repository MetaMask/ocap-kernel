import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.js';
import { marshaledErrorSchema, ErrorCode } from '../constants.js';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.js';

export class VatCapTpConnectionExistsError extends BaseError {
  constructor(vatId: string, options?: ErrorOptionsWithStack) {
    super(
      ErrorCode.VatCapTpConnectionExists,
      'Vat already has a CapTP connection.',
      {
        ...options,
        data: { vatId },
      },
    );
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link VatCapTpConnectionExistsError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.VatCapTpConnectionExists),
    data: object({
      vatId: string(),
    }),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link VatCapTpConnectionExistsError}.
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
  ): VatCapTpConnectionExistsError {
    assert(marshaledError, this.struct);
    return new VatCapTpConnectionExistsError(
      marshaledError.data.vatId,
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(VatCapTpConnectionExistsError);
