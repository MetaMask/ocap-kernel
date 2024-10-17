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
import type { MarshaledOcapError } from '../types.js';

type StreamReadErrorData = { vatId: string } | { supervisorId: string };

export class StreamReadError extends BaseError {
  constructor(data: StreamReadErrorData, originalError: Error) {
    super(
      ErrorCode.StreamReadError,
      'Unexpected stream read error.',
      data,
      originalError,
    );
    harden(this);
  }

  /**
   * A superstruct struct for validating marshaled {@link StreamReadError} instances.
   */
  public static struct = object({
    ...marshaledErrorSchema,
    code: literal(ErrorCode.StreamReadError),
    data: union([
      object({ vatId: string(), supervisorId: optional(never()) }),
      object({ supervisorId: string(), vatId: optional(never()) }),
    ]),
    cause: MarshaledErrorStruct,
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link StreamReadError}.
   *
   * @param marshaledError - The marshaled error to unmarshal.
   * @returns The unmarshaled error.
   */
  public static unmarshal(marshaledError: MarshaledOcapError): StreamReadError {
    assert(marshaledError, this.struct);
    return new StreamReadError(
      marshaledError.data as StreamReadErrorData,
      // The cause will be properly unmarshaled during the parent call.
      new Error(marshaledError.cause?.message),
    );
  }
}
harden(StreamReadError);
