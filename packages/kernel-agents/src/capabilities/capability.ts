import type { ExtractRecordKeys } from '../types/capability.ts';
import type {
  CapabilityRecord,
  CapabilitySpec,
  CapabilitySchema,
  Capability,
} from '../types.ts';

/**
 * Create a capability specification.
 *
 * @param func - The function to create a capability specification for
 * @param schema - The schema for the capability
 * @returns A capability specification
 */
export const capability = <Args extends Record<string, unknown>, Return = null>(
  func: Capability<Args, Return>,
  schema: CapabilitySchema<ExtractRecordKeys<Args>>,
): CapabilitySpec<Args, Return> => ({ func, schema });

type SchemaEntry = [string, { schema: CapabilitySchema<string> }];
/**
 * Extract only the serializable schemas from the capabilities
 *
 * @param capabilities - The capabilities to extract the schemas from
 * @returns A record mapping capability names to their schemas
 */
export const extractCapabilitySchemas = (
  capabilities: CapabilityRecord,
): Record<
  keyof typeof capabilities,
  (typeof capabilities)[keyof typeof capabilities]['schema']
> =>
  Object.fromEntries(
    (Object.entries(capabilities) as unknown as SchemaEntry[]).map(
      ([name, { schema }]) => [name, schema],
    ),
  );

type CapabilityEntry = [string, CapabilitySpec<never, unknown>];
/**
 * Extract only the functions from the capabilities
 *
 * @param capabilities - The capabilities to extract the functions from
 * @returns A record mapping capability names to their functions
 */
export const extractCapabilities = (
  capabilities: CapabilityRecord,
): Record<
  keyof typeof capabilities,
  (typeof capabilities)[keyof typeof capabilities]['func']
> =>
  Object.fromEntries(
    (Object.entries(capabilities) as unknown as CapabilityEntry[]).map(
      ([name, { func }]) => [name, func],
    ),
  );
