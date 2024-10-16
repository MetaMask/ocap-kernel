import { StreamReadError } from './StreamReadError.js';
import { VatAlreadyExistsError } from './VatAlreadyExistsError.js';
import { VatCapTpConnectionExistsError } from './VatCapTpConnectionExistsError.js';
import { VatCapTpConnectionNotFoundError } from './VatCapTpConnectionNotFoundError.js';
import { VatDeletedError } from './VatDeletedError.js';
import { VatNotFoundError } from './VatNotFoundError.js';
import { ErrorCode } from '../types.js';

export const errorClasses: { [K in ErrorCode]: unknown } = {
  [ErrorCode.StreamReadError]: StreamReadError,
  [ErrorCode.VatAlreadyExists]: VatAlreadyExistsError,
  [ErrorCode.VatCapTpConnectionExists]: VatCapTpConnectionExistsError,
  [ErrorCode.VatCapTpConnectionNotFound]: VatCapTpConnectionNotFoundError,
  [ErrorCode.VatDeleted]: VatDeletedError,
  [ErrorCode.VatNotFound]: VatNotFoundError,
} as const;
