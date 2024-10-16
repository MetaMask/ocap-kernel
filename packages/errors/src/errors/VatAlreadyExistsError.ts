import {
  is,
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

export class VatAlreadyExistsError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatAlreadyExists, 'Vat already exists.', {
      vatId,
    });
  }

  /**
   * A superstruct struct for validating marshaled {@link VatAlreadyExistsError} instances.
   */
  public static struct = object({
    [ErrorSentinel]: literal(true),
    message: string(),
    code: literal(ErrorCode.VatAlreadyExists),
    data: object({
      vatId: string(),
    }),
    stack: optional(string()),
    cause: optional(
      union([string(), lazy(() => MarshaledErrorStruct), literal(undefined)]),
    ),
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
    if (!is(marshaledError, this.struct)) {
      throw new Error('Invalid VatAlreadyExistsError structure');
    }
    return new VatAlreadyExistsError(marshaledError.data.vatId);
  }
}
