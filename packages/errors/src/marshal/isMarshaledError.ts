import { is } from '@metamask/superstruct';

import { MarshaledErrorStruct } from '../constants.ts';
import type { MarshaledError } from '../types.ts';

/**
 * Checks if a value is a {@link MarshaledError}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link MarshaledError}.
 */
export function isMarshaledError(value: unknown): value is MarshaledError {
  return is(value, MarshaledErrorStruct);
}
