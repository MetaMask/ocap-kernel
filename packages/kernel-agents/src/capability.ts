import type { Invocation } from './messages.ts';
import type {
  Capability,
  CapabilityRecord,
  CapabilitySchema,
  CapabilitySpec,
  ExtractRecordKeys,
} from './types.ts';

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

export const invokeCapabilities = async (
  invocations: Invocation[],
  capabilities: CapabilityRecord,
): Promise<(Invocation & { result: unknown })[]> =>
  await Promise.all(
    invocations.map(async ({ name, args }) => ({
      name,
      args,
      result: await (async () => {
        const toInvoke = capabilities[name];
        if (!toInvoke) {
          throw new Error(`Invoked capability ${name} not found`);
        }
        return await toInvoke.func(args as never);
      })(),
    })),
  );
