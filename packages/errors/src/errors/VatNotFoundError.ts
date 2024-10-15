import { BaseError } from '../BaseError.js';
import { ErrorCode } from '../types.js';

export class VatNotFoundError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatNotFound, 'Vat does not exist.', { vatId });
  }
}
