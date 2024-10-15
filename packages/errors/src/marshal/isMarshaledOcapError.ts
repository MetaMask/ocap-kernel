import { is } from '@metamask/superstruct';

import type { MarshaledOcapError } from '../types.js';
import { MarshaledErrorStruct } from '../types.js';

/**
 * Checks if a value is a {@link MarshaledOcapError}.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link MarshaledOcapError}.
 */
export function isMarshaledOcapError(
  value: unknown,
): value is MarshaledOcapError {
  return (
    is(value, MarshaledErrorStruct) &&
    Boolean(value.data) &&
    Boolean(value.code)
  );
}
