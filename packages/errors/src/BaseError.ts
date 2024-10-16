import type { Json } from '@metamask/utils';

import type { ErrorCode } from './constants.js';

export class BaseError extends Error {
  public readonly code: ErrorCode;

  public data: Json | undefined;

  public cause: unknown;

  constructor(code: ErrorCode, message: string, data?: Json, cause?: unknown) {
    super(message, { cause });

    this.name = this.constructor.name;
    this.code = code;
    this.data = data;
    this.cause = cause;
  }
}
