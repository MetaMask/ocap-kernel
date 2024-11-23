import { StreamReadError } from './StreamReadError.js';
import { VatAlreadyExistsError } from './VatAlreadyExistsError.js';
import { VatDeletedError } from './VatDeletedError.js';
import { VatNotFoundError } from './VatNotFoundError.js';
import { ErrorCode } from '../constants.js';

export const errorClasses = {
  [ErrorCode.StreamReadError]: StreamReadError,
  [ErrorCode.VatAlreadyExists]: VatAlreadyExistsError,
  [ErrorCode.VatDeleted]: VatDeletedError,
  [ErrorCode.VatNotFound]: VatNotFoundError,
} as const;
