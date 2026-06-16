import { jsonSchemaToStruct } from '@metamask/kernel-utils/json-schema-to-struct';
import { assert } from '@metamask/superstruct';

import type { CapabilitySchema } from '../types.ts';

/**
 * Assert `values` match the capability's declared argument schema using Superstruct.
 *
 * The capability's `args` is a standard object JSON Schema, so validation is a
 * direct {@link jsonSchemaToStruct} of that schema.
 *
 * @param values - Parsed tool arguments (a plain object).
 * @param capabilitySchema - {@link CapabilitySchema} for this capability.
 */
export function validateCapabilityArgs(
  values: Record<string, unknown>,
  capabilitySchema: CapabilitySchema<string>,
): void {
  assert(values, jsonSchemaToStruct(capabilitySchema.args));
}
