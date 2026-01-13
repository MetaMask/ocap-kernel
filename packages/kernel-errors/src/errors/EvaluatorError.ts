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
 * An error indicating a violation of evaluator infrastructure expectations.
 * These errors indicate internal failures that should exit the attempt,
 * such as $return, $catch, or $capture throwing inside the compartment.
 *
 * Note: This error should be impossible to throw in normal operation,
 * even if the compiler cannot detect this.
 */
export class EvaluatorError extends BaseError {
  /**
   * Creates a new EvaluatorError.
   *
   * @param message - A human-readable description of the evaluator error.
   * @param code - An internal code identifying the specific evaluator failure.
   * @param cause - The underlying error that caused this evaluator error.
   * @param options - Additional error options including stack.
   * @param options.data - Additional data about the error.
   * @param options.data.code - An internal code identifying the specific evaluator failure.
   * @param options.cause - The underlying error that caused this evaluator error.
   * @param options.stack - The stack trace of the error.
   */
  constructor(
    message: string,
    code: string,
    cause: Error,
    options?: ErrorOptionsWithStack,
  ) {
    super(ErrorCode.InternalError, message, {
      ...options,
      cause,
      data: { code },
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link EvaluatorError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.InternalError),
    data: object({
      code: string(),
    }),
    cause: optional(union([string(), lazy(() => MarshaledErrorStruct)])),
  });

  /**
   * Unmarshals a {@link MarshaledError} into an {@link EvaluatorError}.
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
  ): EvaluatorError {
    assert(marshaledError, this.struct);
    const cause = marshaledError.cause
      ? (unmarshalErrorOptions(marshaledError).cause as Error)
      : new Error('Unknown cause');
    return new EvaluatorError(
      marshaledError.message,
      marshaledError.data.code,
      cause,
      unmarshalErrorOptions(marshaledError),
    );
  }
}
harden(EvaluatorError);
