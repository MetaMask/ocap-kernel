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

export class VatCapTpConnectionExistsError extends BaseError {
  constructor(vatId: string) {
    super(
      ErrorCode.VatCapTpConnectionExists,
      'Vat already has a CapTP connection.',
      {
        vatId,
      },
    );
  }

  /**
   * A superstruct struct for validating marshaled {@link VatCapTpConnectionExistsError} instances.
   */
  public static struct = object({
    [ErrorSentinel]: literal(true),
    message: string(),
    code: literal(ErrorCode.VatCapTpConnectionExists),
    data: object({
      vatId: string(),
    }),
    stack: optional(string()),
    cause: optional(
      union([string(), lazy(() => MarshaledErrorStruct), literal(undefined)]),
    ),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link VatCapTpConnectionExistsError}.
   *
   * @param marshaledError - The marshaled error to unmarshal.
   * @returns The unmarshaled error.
   */
  public static unmarshal(
    marshaledError: MarshaledOcapError,
  ): VatCapTpConnectionExistsError {
    assert(marshaledError, this.struct);
    return new VatCapTpConnectionExistsError(marshaledError.data.vatId);
  }
}
