import type { Struct } from '@metamask/superstruct';
import { lazy, literal, optional, string, union } from '@metamask/superstruct';
import { JsonStruct, object } from '@metamask/utils';
import type { NonEmptyArray } from '@metamask/utils';

import type { MarshaledError } from './types.js';

export enum ErrorCode {
  StreamReadError = 'STREAM_READ_ERROR',
  VatAlreadyExists = 'VAT_ALREADY_EXISTS',
  VatCapTpConnectionExists = 'VAT_CAPTP_CONNECTION_EXISTS',
  VatCapTpConnectionNotFound = 'VAT_CAPTP_CONNECTION_NOT_FOUND',
  VatDeleted = 'VAT_DELETED',
  VatNotFound = 'VAT_NOT_FOUND',
}
/**
 * A sentinel value to detect marshaled errors.
 */
export const ErrorSentinel = '@@MARSHALED_ERROR';

const ErrorCodeStruct = union(
  Object.values(ErrorCode).map((code) => literal(code)) as NonEmptyArray<
    Struct<ErrorCode>
  >,
);

export const MarshaledErrorStruct = object({
  [ErrorSentinel]: literal(true),
  message: string(),
  code: optional(ErrorCodeStruct),
  data: optional(JsonStruct),
  stack: optional(string()),
  cause: optional(union([string(), lazy(() => MarshaledErrorStruct)])),
}) as Struct<MarshaledError>;
