import type { MethodSchema } from '@metamask/kernel-utils';

import type { CapabilityRecord, CapabilitySpec } from '../types.ts';

type SchemaEntry = [string, { schema: MethodSchema }];
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
