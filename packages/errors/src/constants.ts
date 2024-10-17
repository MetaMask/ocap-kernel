import type { Struct } from '@metamask/superstruct';
import { lazy, literal, optional, string, union } from '@metamask/superstruct';
import { JsonStruct, object } from '@metamask/utils';
import type { NonEmptyArray } from '@metamask/utils';

import type { MarshaledError } from './types.js';

/**
 * Enum defining all error codes for Ocap errors.
 */
export enum ErrorCode {
  StreamReadError = 'STREAM_READ_ERROR',
  VatAlreadyExists = 'VAT_ALREADY_EXISTS',
  VatCapTpConnectionExists = 'VAT_CAPTP_CONNECTION_EXISTS',
  VatCapTpConnectionNotFound = 'VAT_CAPTP_CONNECTION_NOT_FOUND',
  VatDeleted = 'VAT_DELETED',
  VatNotFound = 'VAT_NOT_FOUND',
}

/**
 * A sentinel value used to identify marshaled errors.
 */
export const ErrorSentinel = '@@MARSHALED_ERROR';

const ErrorCodeStruct = union(
  Object.values(ErrorCode).map((code) => literal(code)) as NonEmptyArray<
    Struct<ErrorCode>
  >,
);

/**
 * Struct to validate marshaled errors.
 */
export const MarshaledErrorStruct = object({
  [ErrorSentinel]: literal(true),
  message: string(),
  code: optional(ErrorCodeStruct),
  data: optional(JsonStruct),
  stack: optional(string()),
  cause: optional(union([string(), lazy(() => MarshaledErrorStruct)])),
}) as Struct<MarshaledError>;

/**
 * Base schema for validating Ocap error classes during error marshaling.
 */
export const baseErrorStructSchema = {
  [ErrorSentinel]: literal(true),
  message: string(),
  code: ErrorCodeStruct,
  data: JsonStruct,
  stack: optional(string()),
  cause: optional(union([string(), lazy(() => MarshaledErrorStruct)])),
};
