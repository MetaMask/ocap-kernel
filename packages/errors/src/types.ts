import type { Json } from '@metamask/utils';

import type { ErrorCode, ErrorSentinel } from './constants.ts';

export type ErrorOptionsWithStack = ErrorOptions & {
  stack?: string;
};

export type OcapError = {
  code: ErrorCode;
  data: Json | undefined;
} & Error;

export type MarshaledError = {
  [ErrorSentinel]: true;
  message: string;
  code?: ErrorCode;
  data?: Json;
  stack?: string;
  cause?: MarshaledError | string;
};

export type MarshaledOcapError = Omit<MarshaledError, 'code' | 'data'> & {
  code: ErrorCode;
  data: Json;
};
