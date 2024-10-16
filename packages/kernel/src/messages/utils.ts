// Uncapitalize.

import { hasProperty, isObject } from '@metamask/utils';
import type { ErrorCode } from '@ocap/errors';

export const uncapitalize = (value: string): Uncapitalize<string> =>
  (value.at(0)?.toLowerCase() + value.slice(1)) as Uncapitalize<string>;

// Marshaled error mock.
// TODO(#170): use @ocap/errors marshalling. Delete this.

export type MarshaledError = string;

export const hasMarshaledError = <Mode extends 'required' | 'optional'>(
  mode: Mode,
  value: object,
  ...codes: ErrorCode[]
): value is Mode extends 'required'
  ? { error: MarshaledError }
  : { error?: MarshaledError } =>
  (mode === 'optional' && !hasProperty(value, 'error')) ||
  (isObject(value) &&
    typeof value.error === 'string' &&
    codes.some((code) => (value.error as string).startsWith(code)));
