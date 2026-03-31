import { methodArgsToStruct } from '@metamask/kernel-utils/json-schema-to-struct';
import { assert } from '@metamask/superstruct';

import type { CapabilitySchema } from '../types.ts';

/**
 * Assert `values` match the capability's declared argument schemas using Superstruct.
 *
 * @param values - Parsed tool arguments (a plain object).
 * @param capabilitySchema - {@link CapabilitySchema} for this capability.
 */
export function validateCapabilityArgs(
  values: Record<string, unknown>,
  capabilitySchema: CapabilitySchema<string>,
): void {
  assert(values, methodArgsToStruct(capabilitySchema.args));
}
