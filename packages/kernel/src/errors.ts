import { BaseError } from '@ocap/utils';

export class VatAlreadyExistsError extends BaseError {
  constructor(vatId: string) {
    super('VAT_ALREADY_EXISTS', 'Vat already exists.', {
      vatId,
    });
  }
}

export class VatNotFoundError extends BaseError {
  constructor(vatId: string) {
    super('VAT_NOT_FOUND', 'Vat does not exist.', { vatId });
  }
}

export class SupervisorReadError extends BaseError {
  constructor(supervisorId: string, originalError: Error) {
    super('SUPERVISOR_READ_ERROR', 'Unexpected read error from Supervisor.', {
      supervisorId,
      originalError,
    });
  }
}

export class VatReadError extends BaseError {
  constructor(vatId: string, originalError: Error) {
    super('VAT_READ_ERROR', 'Unexpected read error from Vat.', {
      vatId,
      originalError,
    });
  }
}

export class CapTPConnectionExistsError extends BaseError {
  constructor(vatId: string) {
    super('CAPTP_CONNECTION_EXISTS', 'Vat already has a CapTP connection.', {
      vatId,
    });
  }
}

export class CapTPConnectionNotFoundError extends BaseError {
  constructor(vatId: string) {
    super(
      'CAPTP_CONNECTION_NOT_FOUND',
      'Vat does not have a CapTP connection.',
      { vatId },
    );
  }
}

export class VatDeletedError extends BaseError {
  constructor(vatId: string) {
    super('VAT_DELETED', 'Vat was deleted.', { vatId });
  }
}
