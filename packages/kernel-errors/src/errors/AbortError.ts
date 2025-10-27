import {
  assert,
  literal,
  never,
  object,
  optional,
} from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

export class AbortError extends BaseError {
  constructor(options?: ErrorOptionsWithStack) {
    super(ErrorCode.AbortError, 'Operation aborted.', {
      ...options,
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link AbortError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.AbortError),
    data: optional(never()),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link AbortError}.
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
  ): AbortError {
    assert(marshaledError, this.struct);
    return new AbortError(unmarshalErrorOptions(marshaledError));
  }
}
harden(AbortError);
