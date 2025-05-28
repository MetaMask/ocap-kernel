import { assert, literal, object, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import { marshaledErrorSchema, ErrorCode } from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

export class SubclusterNotFoundError extends BaseError {
  constructor(subclusterId: string, options?: ErrorOptionsWithStack) {
    super(ErrorCode.SubclusterNotFound, 'Subcluster does not exist.', {
      ...options,
      data: { subclusterId },
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link SubclusterNotFoundError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.SubclusterNotFound),
    data: object({
      subclusterId: string(),
    }),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link SubclusterNotFoundError}.
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
  ): SubclusterNotFoundError {
    assert(marshaledError, this.struct);
    return new SubclusterNotFoundError(
      marshaledError.data.subclusterId,
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(SubclusterNotFoundError);
