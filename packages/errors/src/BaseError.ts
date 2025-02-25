import type { Json } from '@metamask/utils';

import { ErrorCode } from './constants.js';
import type {
  MarshaledOcapError,
  OcapError,
  ErrorOptionsWithStack,
  MarshaledError,
} from './types.js';

export class BaseError extends Error implements OcapError {
  public readonly code: ErrorCode;

  public readonly data: Json | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: ErrorOptionsWithStack & {
      data?: Json;
    } = {},
  ) {
    const { data, cause, stack } = options;

    super(message, { cause });

    this.name = this.constructor.name;
    this.code = code;
    this.data = data;

    // override the stack property if provided
    if (stack) {
      this.stack = stack;
    }

    harden(this);
  }

  /**
   * A placeholder for unmarshal functionality. Should be implemented in subclasses.
   *
   * @param _marshaledError - The marshaled error to unmarshal.
   * @param _unmarshalErrorOptions - A function to unmarshal the error options.
   */
  public static unmarshal(
    _marshaledError: MarshaledOcapError,
    _unmarshalErrorOptions: (
      marshaledError: MarshaledError,
    ) => ErrorOptionsWithStack,
  ): BaseError {
    throw new Error('Unmarshal method not implemented');
  }
}
harden(BaseError);
