import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.js';
import { marshaledErrorSchema, ErrorCode } from '../constants.js';
import type { MarshaledOcapError } from '../types.js';

export class VatDeletedError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatDeleted, 'Vat was deleted.', { vatId });
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
   * @returns The unmarshaled error.
   */
  public static unmarshal(marshaledError: MarshaledOcapError): VatDeletedError {
    assert(marshaledError, this.struct);
    return new VatDeletedError(marshaledError.data.vatId);
  }
}
harden(VatDeletedError);
