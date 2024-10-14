import type { Json } from '@metamask/utils';

export enum ErrorCode {
  SupervisorReadError = 'SUPERVISOR_READ_ERROR',
  VatAlreadyExists = 'VAT_ALREADY_EXISTS',
  VatCapTpConnectionExists = 'VAT_CAPTP_CONNECTION_EXISTS',
  VatCapTpConnectionNotFound = 'VAT_CAPTP_CONNECTION_NOT_FOUND',
  VatDeleted = 'VAT_DELETED',
  VatNotFound = 'VAT_NOT_FOUND',
  VatReadError = 'VAT_READ_ERROR',
}

export type OcapError = {
  code: ErrorCode;
  data: Json | undefined;
} & Error;
