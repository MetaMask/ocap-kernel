import { is, literal, object, optional, string } from '@metamask/superstruct';

import { BaseError } from '../BaseError.js';
import type { MarshaledOcapError } from '../types.js';
import { ErrorCode, ErrorSentinel, MarshaledErrorStruct } from '../types.js';

type StreamReadErrorData = { vatId: string } | { supervisorId: string };

export class StreamReadError extends BaseError {
  constructor(data: StreamReadErrorData, originalError: Error) {
    super(
      ErrorCode.StreamReadError,
      'Unexpected stream read error.',
      data,
      originalError,
    );
  }

  /**
   * A superstruct struct for validating marshaled {@link StreamReadError} instances.
   */
  public static struct = object({
    [ErrorSentinel]: literal(true),
    message: string(),
    code: literal(ErrorCode.StreamReadError),
    data: object({
      vatId: optional(string()),
      supervisorId: optional(string()),
    }),
    stack: optional(string()),
    cause: MarshaledErrorStruct,
  });

  /**
   * Unmarshals a {@link MarshaledError} into a {@link StreamReadError}.
   *
   * @param marshaledError - The marshaled error to unmarshal.
   * @returns The unmarshaled error.
   */
  public static unmarshal(marshaledError: MarshaledOcapError): StreamReadError {
    if (!is(marshaledError, this.struct)) {
      throw new Error('Invalid StreamReadError structure');
    }
    return new StreamReadError(
      marshaledError.data as StreamReadErrorData,
      // The cause will be properly unmarshaled during the parent call.
      new Error(marshaledError.cause?.message),
    );
  }
}
