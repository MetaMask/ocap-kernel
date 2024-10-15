import type { Struct } from '@metamask/superstruct';
import { lazy, literal, optional, string, union } from '@metamask/superstruct';
import { JsonStruct, object } from '@metamask/utils';
import type { Json } from '@metamask/utils';

export enum ErrorCode {
  StreamReadError = 'STREAM_READ_ERROR',
  VatAlreadyExists = 'VAT_ALREADY_EXISTS',
  VatCapTpConnectionExists = 'VAT_CAPTP_CONNECTION_EXISTS',
  VatCapTpConnectionNotFound = 'VAT_CAPTP_CONNECTION_NOT_FOUND',
  VatDeleted = 'VAT_DELETED',
  VatNotFound = 'VAT_NOT_FOUND',
}

export type OcapError = {
  code: ErrorCode;
  data: Json | undefined;
} & Error;

/**
 * A sentinel value to detect marshaled errors.
 */
export const ErrorSentinel = '@@MARSHALED_ERROR';

/**
 * A marshaled error.
 */
export type MarshaledError = {
  [ErrorSentinel]: true;
  message: string;
  code?: ErrorCode;
  data?: Json;
  stack?: string;
  cause?: MarshaledError | string;
};

export const MarshaledErrorStruct: Struct<MarshaledError> = object({
  [ErrorSentinel]: literal(true),
  message: string(),
  code: optional(string()),
  data: optional(JsonStruct),
  stack: optional(string()),
  cause: optional(union([string(), lazy(() => MarshaledErrorStruct)])),
}) as Struct<MarshaledError>;
