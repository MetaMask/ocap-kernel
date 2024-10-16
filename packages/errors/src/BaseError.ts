import type { Json } from '@metamask/utils';

import type { ErrorCode } from './constants.js';
import type { MarshaledOcapError, OcapError } from './types.js';

export class BaseError extends Error implements OcapError {
  public readonly code: ErrorCode;

  public data: Json | undefined;

  constructor(code: ErrorCode, message: string, data?: Json, cause?: unknown) {
    super(message, { cause });

    this.name = this.constructor.name;
    this.code = code;
    this.data = data;
    this.cause = cause;
  }

  /**
   * A placeholder for unmarshal functionality. Should be implemented in subclasses.
   *
   * @param _marshaledError - The marshaled error to unmarshal.
   */
  public static unmarshal(_marshaledError: MarshaledOcapError): BaseError {
    throw new Error('Unmarshal method not implemented');
  }
}
