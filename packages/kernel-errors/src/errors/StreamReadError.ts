import {
  assert,
  literal,
  never,
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

type StreamReadErrorData = { vatId: string } | { kernelId: string };
type StreamReadErrorOptions = Required<ErrorOptions> &
  Pick<ErrorOptionsWithStack, 'stack'>;

/**
 * Error indicating an unexpected failure while reading from a stream.
 */
export class StreamReadError extends BaseError {
  /**
   * Creates a new StreamReadError.
   *
   * @param data - Context data identifying the source of the error (vatId or kernelId).
   * @param options - Error options including the underlying cause and stack trace.
   */
  constructor(data: StreamReadErrorData, options: StreamReadErrorOptions) {
    super(ErrorCode.StreamReadError, 'Unexpected stream read error.', {
      ...options,
      data,
    });
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link StreamReadError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.StreamReadError),
    data: union([
      object({
        vatId: string(),
        kernelId: optional(never()),
      }),
      object({
        vatId: optional(never()),
        kernelId: optional(never()),
      }),
      object({
        kernelId: string(),
        vatId: optional(never()),
      }),
    ]),
    cause: MarshaledErrorStruct,
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link StreamReadError}.
   *
   * @param marshaledError - The marshaled error to unmarshal.
   * @param unmarshalErrorOptions - A function to unmarshal the error options.
   * @returns The unmarshaled error.
   */
  public static unmarshal(
    marshaledError: MarshaledOcapError,
    unmarshalErrorOptions: (
      marshaledError: MarshaledOcapError,
    ) => ErrorOptionsWithStack,
  ): StreamReadError {
    assert(marshaledError, this.struct);
    return new StreamReadError(
      marshaledError.data as StreamReadErrorData,
      unmarshalErrorOptions(marshaledError) as StreamReadErrorOptions,
    );
  }
}
harden(StreamReadError);
