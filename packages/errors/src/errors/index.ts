import { StreamReadError } from './StreamReadError.ts';
import { VatAlreadyExistsError } from './VatAlreadyExistsError.ts';
import { VatDeletedError } from './VatDeletedError.ts';
import { VatNotFoundError } from './VatNotFoundError.ts';
import { ErrorCode } from '../constants.ts';

export const errorClasses = {
  [ErrorCode.StreamReadError]: StreamReadError,
  [ErrorCode.VatAlreadyExists]: VatAlreadyExistsError,
  [ErrorCode.VatDeleted]: VatDeletedError,
  [ErrorCode.VatNotFound]: VatNotFoundError,
} as const;
