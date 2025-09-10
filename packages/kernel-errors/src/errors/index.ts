import { DuplicateEndowmentError } from './DuplicateEndowmentError.ts';
import { StreamReadError } from './StreamReadError.ts';
import { VatAlreadyExistsError } from './VatAlreadyExistsError.ts';
import { VatDeletedError } from './VatDeletedError.ts';
import { VatNotFoundError } from './VatNotFoundError.ts';
import { ErrorCode } from '../constants.ts';
import { SubclusterNotFoundError } from './SubclusterNotFoundError.ts';

export const errorClasses = {
  [ErrorCode.DuplicateEndowment]: DuplicateEndowmentError,
  [ErrorCode.StreamReadError]: StreamReadError,
  [ErrorCode.VatAlreadyExists]: VatAlreadyExistsError,
  [ErrorCode.VatDeleted]: VatDeletedError,
  [ErrorCode.VatNotFound]: VatNotFoundError,
  [ErrorCode.SubclusterNotFound]: SubclusterNotFoundError,
} as const;
