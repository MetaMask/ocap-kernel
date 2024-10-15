import { BaseError } from './BaseError.js';
import { ErrorCode } from './constants.js';

export class VatAlreadyExistsError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatAlreadyExists, 'Vat already exists.', {
      vatId,
    });
  }
}

export class VatNotFoundError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatNotFound, 'Vat does not exist.', { vatId });
  }
}

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

export class VatCapTpConnectionExistsError extends BaseError {
  constructor(vatId: string) {
    super(
      ErrorCode.VatCapTpConnectionExists,
      'Vat already has a CapTP connection.',
      {
        vatId,
      },
    );
  }
}

export class VatCapTpConnectionNotFoundError extends BaseError {
  constructor(vatId: string) {
    super(
      ErrorCode.VatCapTpConnectionNotFound,
      'Vat does not have a CapTP connection.',
      { vatId },
    );
  }
}

export class VatDeletedError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatDeleted, 'Vat was deleted.', { vatId });
  }
}
