import { BaseError } from '../BaseError.js';
import { ErrorCode } from '../types.js';

export class VatAlreadyExistsError extends BaseError {
  constructor(vatId: string) {
    super(ErrorCode.VatAlreadyExists, 'Vat already exists.', {
      vatId,
    });
  }
}
