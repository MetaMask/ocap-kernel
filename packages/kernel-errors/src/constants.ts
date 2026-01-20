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

import { ErrorCode, ErrorSentinel } from './error-codes.ts';
import type { MarshaledError, MarshaledOcapError } from './types.ts';

// Re-export for backward compatibility
export {
  ErrorCode,
  ErrorSentinel,
  isSampleGenerationError,
} from './error-codes.ts';

/**
 * Struct to validate plain {@link Error} objects.
 */
export const ErrorStruct = define<Error>(
  'Error',
  (value) => value instanceof Error,
);

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
