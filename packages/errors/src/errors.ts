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

export class SupervisorReadError extends BaseError {
  constructor(supervisorId: string, originalError: Error) {
    super(
      ErrorCode.SupervisorReadError,
      'Unexpected read error from Supervisor.',
      {
        supervisorId,
      },
      originalError,
    );
  }
}

export class VatReadError extends BaseError {
  constructor(vatId: string, originalError: Error) {
    super(
      ErrorCode.VatReadError,
      'Unexpected read error from Vat.',
      {
        vatId,
      },
      originalError,
    );
  }
}

export class CapTPConnectionExistsError extends BaseError {
  constructor(vatId: string) {
    super(
      ErrorCode.CaptpConnectionExists,
      'Vat already has a CapTP connection.',
      {
        vatId,
      },
    );
  }
}

export class CapTPConnectionNotFoundError extends BaseError {
  constructor(vatId: string) {
    super(
      ErrorCode.CaptpConnectionNotFound,
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
