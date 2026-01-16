import { E } from '@endo/eventual-send';
import type { DiscoverableExo } from '@metamask/kernel-utils/discoverable';
import type { MethodSchema } from '@metamask/kernel-utils/schema';

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
    Object.entries(description).map(([name, schema]) => {
      // Get argument names in order from the schema.
      // IMPORTANT: This relies on the schema's args object having keys in the same
      // order as the method's parameters. The schema must be defined with argument
      // names matching the method parameter order (e.g., for method `add(a, b)`,
      // the schema must have `args: { a: ..., b: ... }` in that order).
      // JavaScript objects preserve insertion order for string keys, so Object.keys()
      // will return keys in the order they were defined in the schema.
      const argNames = Object.keys(schema.args);

      // Create a capability function that accepts an args object
      // and maps it to positional arguments for the exo method
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const func = async (args: Record<string, unknown>) => {
        // Map object arguments to positional arguments in schema order.
        // The order of argNames matches the method parameter order by convention.
        const positionalArgs = argNames.map((argName) => args[argName]);
        // @ts-expect-error - E type doesn't remember method names
        return E(exo)[name](...positionalArgs);
      };

      return [name, { func, schema }] as [
        string,
        CapabilitySpec<never, unknown>,
      ];
    }),
  );

  return capabilities;
};
