import { E } from '@endo/eventual-send';
import type { DiscoverableExo, MethodSchema } from '@metamask/kernel-utils';

import type { CapabilityRecord, CapabilitySpec } from '../types.ts';

/**
 * Discover the capabilities of a discoverable exo. Intended for use from inside a vat.
 * This function fetches the schema from the discoverable exo and creates capabilities that can be used by kernel agents.
 *
 * @param exo - The discoverable exo to convert to a capability record.
 * @returns A promise for a capability record.
 */
export const discover = async (
  exo: DiscoverableExo,
): Promise<CapabilityRecord> => {
  // @ts-expect-error - E type doesn't remember method names
  const description = (await E(exo).describe()) as Record<string, MethodSchema>;

  const capabilities: CapabilityRecord = Object.fromEntries(
    Object.entries(description).map(
      ([name, schema]) =>
        [
          name,
          // @ts-expect-error - TODO: fix types
          { func: async (...args: unknown[]) => E(exo)[name](...args), schema },
        ] as [string, CapabilitySpec<never, unknown>],
    ),
  );

  return capabilities;
};
