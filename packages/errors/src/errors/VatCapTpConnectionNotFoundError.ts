import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.js';
import { marshaledErrorSchema, ErrorCode } from '../constants.js';
import type { MarshaledOcapError } from '../types.js';

export class VatCapTpConnectionNotFoundError extends BaseError {
  constructor(vatId: string) {
    super(
      ErrorCode.VatCapTpConnectionNotFound,
      'Vat does not have a CapTP connection.',
      { vatId },
    );
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link VatCapTpConnectionNotFoundError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.VatCapTpConnectionNotFound),
    data: object({
      vatId: string(),
    }),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link VatCapTpConnectionNotFoundError}.
   *
   * @param marshaledError - The marshaled error to unmarshal.
   * @returns The unmarshaled error.
   */
  public static unmarshal(
    marshaledError: MarshaledOcapError,
  ): VatCapTpConnectionNotFoundError {
    assert(marshaledError, this.struct);
    return new VatCapTpConnectionNotFoundError(marshaledError.data.vatId);
  }
}
harden(VatCapTpConnectionNotFoundError);
