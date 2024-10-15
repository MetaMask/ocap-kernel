import { is } from '@metamask/superstruct';

import type { MarshaledError } from '../types.js';
import { MarshaledErrorStruct } from '../types.js';

/**
 * Checks if a value is a {@link MarshaledError}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link MarshaledError}.
 */
export function isMarshaledError(value: unknown): value is MarshaledError {
  return is(value, MarshaledErrorStruct);
}
