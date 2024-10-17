import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.js';
import { marshaledErrorSchema, ErrorCode } from '../constants.js';
import type { MarshaledOcapError } from '../types.js';

export class VatAlreadyExistsError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatAlreadyExists, 'Vat already exists.', {
      vatId,
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
   * @returns The unmarshaled error.
   */
  public static unmarshal(
    marshaledError: MarshaledOcapError,
  ): VatAlreadyExistsError {
    assert(marshaledError, this.struct);
    return new VatAlreadyExistsError(marshaledError.data.vatId);
  }
}
harden(VatAlreadyExistsError);
