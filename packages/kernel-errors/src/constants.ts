import type { Struct } from '@metamask/superstruct';
import {
  define,
  lazy,
  literal,
  optional,
  string,
  union,
} from '@metamask/superstruct';
import { JsonStruct, object } from '@metamask/utils';
import type { NonEmptyArray } from '@metamask/utils';

import type { MarshaledError, MarshaledOcapError } from './types.ts';

/**
 * Struct to validate plain {@link Error} objects.
 */
export const ErrorStruct = define<Error>(
  'Error',
  (value) => value instanceof Error,
);

/**
 * Enum defining all error codes for Ocap errors.
 */
export const ErrorCode = {
  AbortError: 'ABORT_ERROR',
  DuplicateEndowment: 'DUPLICATE_ENDOWMENT',
  StreamReadError: 'STREAM_READ_ERROR',
  VatAlreadyExists: 'VAT_ALREADY_EXISTS',
  VatDeleted: 'VAT_DELETED',
  VatNotFound: 'VAT_NOT_FOUND',
  SubclusterNotFound: 'SUBCLUSTER_NOT_FOUND',
  SampleGenerationError: 'SAMPLE_GENERATION_ERROR',
  InternalError: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * A sentinel value used to identify marshaled errors.
 */
export const ErrorSentinel = '@@MARSHALED_ERROR';

const ErrorCodeStruct = union(
  Object.values(ErrorCode).map((code) => literal(code)) as NonEmptyArray<
    Struct<ErrorCode>
  >,
);

export const marshaledErrorSchema = {
  [ErrorSentinel]: literal(true),
  message: string(),
  code: optional(ErrorCodeStruct),
  data: optional(JsonStruct),
  stack: optional(string()),
};

/**
 * Struct to validate marshaled errors.
 */
export const MarshaledErrorStruct = object({
  ...marshaledErrorSchema,
  cause: optional(union([string(), lazy(() => MarshaledErrorStruct)])),
}) as Struct<MarshaledError>;

/**
 * Struct to validate marshaled ocap errors.
 */
export const MarshaledOcapErrorStruct = object({
  ...marshaledErrorSchema,
  code: ErrorCodeStruct,
  data: JsonStruct,
  cause: optional(union([string(), lazy(() => MarshaledErrorStruct)])),
}) as Struct<MarshaledOcapError>;
