import { BaseError } from '../BaseError.js';
import { ErrorCode } from '../types.js';

export class VatDeletedError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatDeleted, 'Vat was deleted.', { vatId });
  }
}
