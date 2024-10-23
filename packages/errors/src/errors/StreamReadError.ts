import {
  assert,
  literal,
  never,
  object,
  optional,
  string,
  union,
} from '@metamask/superstruct';

import { BaseError } from '../BaseError.js';
import {
  marshaledErrorSchema,
  ErrorCode,
  MarshaledErrorStruct,
} from '../constants.js';
import type { ErrorOptionsWithStack, MarshaledOcapError } from '../types.js';

type StreamReadErrorData =
  | { vatId: string }
  | { supervisorId: string }
  | { kernelId: string };
type StreamReadErrorOptions = Required<ErrorOptions> &
  Pick<ErrorOptionsWithStack, 'stack'>;

export class StreamReadError extends BaseError {
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
        supervisorId: optional(never()),
        kernelId: optional(never()),
      }),
      object({
        supervisorId: string(),
        vatId: optional(never()),
        kernelId: optional(never()),
      }),
      object({
        kernelId: string(),
        vatId: optional(never()),
        supervisorId: optional(never()),
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
