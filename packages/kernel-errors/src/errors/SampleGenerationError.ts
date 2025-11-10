import {
  assert,
  lazy,
  literal,
  object,
  optional,
  string,
  union,
} from '@metamask/superstruct';

import { BaseError } from '../BaseError.ts';
import {
  marshaledErrorSchema,
  ErrorCode,
  MarshaledErrorStruct,
} from '../constants.ts';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.ts';

/**
 * An error indicating that the LLM generated invalid response.
 * This error should trigger resampling from the LLM.
 */
export class SampleGenerationError extends BaseError {
  constructor(sample: string, cause: Error, options?: ErrorOptionsWithStack) {
    super(ErrorCode.SampleGenerationError, 'LLM generated invalid response.', {
      ...options,
      cause,
      data: { sample },
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link SampleGenerationError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.SampleGenerationError),
    data: object({
      sample: string(),
    }),
    cause: optional(union([string(), lazy(() => MarshaledErrorStruct)])),
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link SampleGenerationError}.
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
  ): SampleGenerationError {
    assert(marshaledError, this.struct);
    const cause = marshaledError.cause
      ? (unmarshalErrorOptions(marshaledError).cause as Error)
      : new Error('Unknown cause');
    return new SampleGenerationError(
      marshaledError.data.sample,
      cause,
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(SampleGenerationError);
