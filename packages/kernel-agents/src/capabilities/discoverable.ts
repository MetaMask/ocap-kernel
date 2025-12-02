import type { MethodSchema } from '@metamask/kernel-utils';
import type { Kernel } from '@metamask/ocap-kernel';
import { kunser } from '@metamask/ocap-kernel';

import { capability } from './capability.ts';
import type { CapabilityRecord } from '../types.ts';

/**
 * Convert a discoverable exo's schema to agent capabilities.
 * This function fetches the schema from the discoverable exo and creates
 * capabilities that can be used by kernel agents.
 *
 * @param kernel - The kernel instance to use for messaging.
 * @param discoverableExoRef - The KRef to the discoverable exo.
 * @returns A promise that resolves to a record of capabilities.
 */
export const discoverableExoToCapabilities = async (
  kernel: Kernel,
  discoverableExoRef: string,
): Promise<CapabilityRecord> => {
  // Get the schema from the discoverable exo
  const describeResult = await kernel.queueMessage(
    discoverableExoRef,
    'describe',
    [],
  );
  const schema = kunser(describeResult) as Record<string, MethodSchema>;

  // Convert each method to a capability
  const capabilities: CapabilityRecord = Object.fromEntries(
    Object.entries(schema).map(([methodName, methodSchema]) => {
      const argNames = Object.keys(methodSchema.args);
      return [
        methodName,
        capability(
          async (args: Record<string, unknown>) => {
            // Extract arguments in the order they appear in the schema
            const methodArgs = argNames.map((argName) => args[argName]);
            const result = await kernel.queueMessage(
              discoverableExoRef,
              methodName,
              methodArgs,
            );
            return kunser(result);
          },
          {
            description: methodSchema.description,
            args: methodSchema.args,
            ...(methodSchema.returns ? { returns: methodSchema.returns } : {}),
          },
        ),
      ];
    }),
  );

  return capabilities;
};
