import { BaseError } from '../BaseError.js';
import { ErrorCode } from '../types.js';

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
