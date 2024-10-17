import {
  assert,
  lazy,
  literal,
  object,
  optional,
  string,
  union,
} from '@metamask/superstruct';

import { BaseError } from '../BaseError.js';
import {
  ErrorCode,
  ErrorSentinel,
  MarshaledErrorStruct,
} from '../constants.js';
import type { MarshaledOcapError } from '../types.js';

export class VatNotFoundError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatNotFound, 'Vat does not exist.', { vatId });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link VatNotFoundError} instances.
   */
  public static struct = object({
    [ErrorSentinel]: literal(true),
    message: string(),
    code: literal(ErrorCode.VatNotFound),
    data: object({
      vatId: string(),
    }),
    stack: optional(string()),
    cause: optional(
      union([string(), lazy(() => MarshaledErrorStruct), literal(undefined)]),
    ),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link VatNotFoundError}.
   *
   * @param marshaledError - The marshaled error to unmarshal.
   * @returns The unmarshaled error.
   */
  public static unmarshal(
    marshaledError: MarshaledOcapError,
  ): VatNotFoundError {
    assert(marshaledError, this.struct);
    return new VatNotFoundError(marshaledError.data.vatId);
  }
}
harden(VatNotFoundError);
