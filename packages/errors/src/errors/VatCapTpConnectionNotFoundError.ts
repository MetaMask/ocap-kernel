import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.js';
import { marshaledErrorSchema, ErrorCode } from '../constants.js';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.js';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.js';

export class VatCapTpConnectionNotFoundError extends BaseError {
  constructor(vatId: string, options?: ErrorOptionsWithStack) {
    super(
      ErrorCode.VatCapTpConnectionNotFound,
      'Vat does not have a CapTP connection.',
      {
        ...options,
        data: { vatId },
      },
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
    return new VatCapTpConnectionNotFoundError(
      marshaledError.data.vatId,
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(VatCapTpConnectionNotFoundError);
