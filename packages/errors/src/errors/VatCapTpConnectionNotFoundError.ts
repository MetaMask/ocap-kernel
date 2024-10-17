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

export class VatCapTpConnectionNotFoundError extends BaseError {
  constructor(vatId: string) {
    super(
      ErrorCode.VatCapTpConnectionNotFound,
      'Vat does not have a CapTP connection.',
      { vatId },
    );
  }

  /**
   * A superstruct struct for validating marshaled {@link VatCapTpConnectionNotFoundError} instances.
   */
  public static struct = object({
    [ErrorSentinel]: literal(true),
    message: string(),
    code: literal(ErrorCode.VatCapTpConnectionNotFound),
    data: object({
      vatId: string(),
    }),
    stack: optional(string()),
    cause: optional(
      union([string(), lazy(() => MarshaledErrorStruct), literal(undefined)]),
    ),
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
