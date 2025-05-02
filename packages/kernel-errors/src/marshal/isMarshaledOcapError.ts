import { is } from '@metamask/superstruct';

import { MarshaledOcapErrorStruct } from '../constants.ts';
import type { MarshaledOcapError } from '../types.ts';

/**
 * Checks if a value is a {@link MarshaledOcapError}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link MarshaledOcapError}.
 */
export function isMarshaledOcapError(
  value: unknown,
): value is MarshaledOcapError {
  return is(value, MarshaledOcapErrorStruct);
}
