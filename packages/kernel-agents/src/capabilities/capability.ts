import { validateCapabilityArgs } from './validate-capability-args.ts';
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

/**
 * Extract the capability functions, each wrapped so its arguments are validated
 * against the capability's schema before the underlying function is invoked.
 *
 * This gives code-executing strategies (e.g. the REPL) the same runtime
 * argument contract that the JSON and chat strategies enforce, turning the
 * schema from a prompt-only artifact into an invocation-time check.
 *
 * @param capabilities - The capabilities to extract validated functions from
 * @returns A record mapping capability names to validating functions
 */
export const extractValidatedCapabilities = (
  capabilities: CapabilityRecord,
): Record<
  keyof typeof capabilities,
  (typeof capabilities)[keyof typeof capabilities]['func']
> =>
  Object.fromEntries(
    (
      Object.entries(capabilities) as unknown as [
        string,
        CapabilitySpec<never, unknown>,
      ][]
    ).map(([name, { func, schema }]) => [
      name,
      // Deliberately synchronous (not `async`): validation must throw at the
      // call site so a code-executing caller's try/catch sees it, rather than
      // surfacing as an unhandled promise rejection.
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      (args: never) => {
        // A code-executing caller may invoke a no-arg capability as `cap()`,
        // so coerce a missing args object to `{}` for validation purposes.
        validateCapabilityArgs((args ?? {}) as Record<string, unknown>, schema);
        return func(args);
      },
    ]),
  );
