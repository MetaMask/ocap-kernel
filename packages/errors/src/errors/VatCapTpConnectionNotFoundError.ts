import { BaseError } from '../BaseError.js';
import { ErrorCode } from '../types.js';

export class VatCapTpConnectionNotFoundError extends BaseError {
  constructor(vatId: string) {
    super(
      ErrorCode.VatCapTpConnectionNotFound,
      'Vat does not have a CapTp connection.',
      { vatId },
    );
  }
}
