import { AbortError } from './AbortError.ts';
import { DuplicateEndowmentError } from './DuplicateEndowmentError.ts';
import { EvaluatorError } from './EvaluatorError.ts';
import { SampleGenerationError } from './SampleGenerationError.ts';
import { StreamReadError } from './StreamReadError.ts';
import { VatAlreadyExistsError } from './VatAlreadyExistsError.ts';
import { VatDeletedError } from './VatDeletedError.ts';
import { VatNotFoundError } from './VatNotFoundError.ts';
import { ErrorCode } from '../constants.ts';
import { SubclusterNotFoundError } from './SubclusterNotFoundError.ts';

export const errorClasses = {
  [ErrorCode.AbortError]: AbortError,
  [ErrorCode.DuplicateEndowment]: DuplicateEndowmentError,
  [ErrorCode.StreamReadError]: StreamReadError,
  [ErrorCode.VatAlreadyExists]: VatAlreadyExistsError,
  [ErrorCode.VatDeleted]: VatDeletedError,
  [ErrorCode.VatNotFound]: VatNotFoundError,
  [ErrorCode.SubclusterNotFound]: SubclusterNotFoundError,
  [ErrorCode.SampleGenerationError]: SampleGenerationError,
  [ErrorCode.InternalError]: EvaluatorError,
} as const;
