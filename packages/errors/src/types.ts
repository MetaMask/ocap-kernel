import type { Struct } from '@metamask/superstruct';
import { lazy, literal, optional, string, union } from '@metamask/superstruct';
import { JsonStruct, object } from '@metamask/utils';
import type { Json, NonEmptyArray } from '@metamask/utils';

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

export type MarshaledError = {
  [ErrorSentinel]: true;
  message: string;
  code?: ErrorCode;
  data?: string;
  stack?: string;
  cause?: MarshaledError | string;
};

export type MarshaledOcapError = Omit<MarshaledError, 'code' | 'data'> & {
  code: ErrorCode;
  data: string;
};

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
