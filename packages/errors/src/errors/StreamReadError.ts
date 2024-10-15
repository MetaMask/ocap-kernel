import { BaseError } from '../BaseError.js';
import { ErrorCode } from '../types.js';

export class StreamReadError extends BaseError {
  constructor(
    data: { vatId: string } | { supervisorId: string },
    originalError: Error,
  ) {
    super(
      ErrorCode.StreamReadError,
      'Unexpected stream read error.',
      data,
      originalError,
    );
  }
}
