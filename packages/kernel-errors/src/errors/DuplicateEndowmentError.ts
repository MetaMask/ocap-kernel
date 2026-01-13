import {
  assert,
  boolean,
  literal,
  object,
  string,
} from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

/**
 * Error indicating a duplicate endowment was detected.
 */
export class DuplicateEndowmentError extends BaseError {
  /**
   * Creates a new DuplicateEndowmentError.
   *
   * @param endowmentName - The name of the duplicate endowment.
   * @param isInternal - Whether the duplicate is an internal endowment.
   * @param options - Additional error options including cause and stack.
   * @param options.data - Additional data about the error.
   * @param options.data.endowmentName - The name of the duplicate endowment.
   * @param options.data.isInternal - Whether the duplicate is an internal endowment.
   * @param options.cause - The underlying error that caused the duplicate endowment error.
   * @param options.stack - The stack trace of the error.
   */
  constructor(
    endowmentName: string,
    isInternal: boolean,
    options?: ErrorOptionsWithStack,
  ) {
    super(ErrorCode.DuplicateEndowment, 'Duplicate endowment.', {
      ...options,
      data: { endowmentName, isInternal },
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link DuplicateEndowmentError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.DuplicateEndowment),
    data: object({
      endowmentName: string(),
      isInternal: boolean(),
    }),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link DuplicateEndowmentError}.
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
  ): DuplicateEndowmentError {
    assert(marshaledError, this.struct);
    return new DuplicateEndowmentError(
      marshaledError.data.endowmentName,
      marshaledError.data.isInternal,
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(DuplicateEndowmentError);
