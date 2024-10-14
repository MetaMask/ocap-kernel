import { BaseError } from './BaseError.js';
import { ErrorCode } from './types.js';

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

export class VatCapTpConnectionExistsError extends BaseError {
  constructor(vatId: string) {
    super(
      ErrorCode.VatCapTpConnectionExists,
      'Vat already has a CapTp connection.',
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
      'Vat does not have a CapTp connection.',
      { vatId },
    );
  }
}

export class VatDeletedError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatDeleted, 'Vat was deleted.', { vatId });
  }
}
