import { E } from '@endo/eventual-send';
import { GET_DESCRIPTION, makeDiscoverableExo } from '@metamask/kernel-utils';
import type {
  DescribedInterface,
  DiscoverableExo,
  MethodSchema,
} from '@metamask/kernel-utils';

import type { CapabilityRecord, CapabilitySpec } from '../types.ts';

/**
 * Invoke a discoverable exo's method with positional arguments. The async
 * variant ({@link discover}) sends over an eventual-send boundary; the local
 * variant ({@link makeInternalCapabilities}) calls the in-realm exo directly.
 * Either way the exo's interface guard enforces the argument shape.
 */
type Invoke = (method: string, positionalArgs: unknown[]) => unknown;

/**
 * Render a method's expected call signature from its schema — e.g.
 * `add(a: number, b: number)` — for use in invocation-error messages.
 *
 * @param name - The method name.
 * @param schema - The method schema whose `args` describe the parameters.
 * @returns The formatted signature.
 */
const formatSignature = (name: string, schema: MethodSchema): string => {
  const params = Object.entries(schema.args)
    .map(([arg, argSchema]) => `${arg}: ${argSchema.type}`)
    .join(', ');
  return `${name}(${params})`;
};

/**
 * Build a {@link CapabilityRecord} from a method-schema description, mapping each
 * capability's object arguments to positional arguments for the exo method.
 *
 * IMPORTANT: this relies on each `schema.args` having keys in the same order as
 * the method's parameters. Schemas authored with the `described*()` combinators
 * (`@metamask/kernel-utils`) satisfy this by construction, since their `args`
 * record is built in declared positional order.
 *
 * @param description - The exo's method schemas, keyed by method name.
 * @param invoke - How to invoke a method with positional arguments.
 * @returns The capability record.
 */
const capabilitiesFrom = (
  description: Record<string, MethodSchema>,
  invoke: Invoke,
): CapabilityRecord =>
  Object.fromEntries(
    Object.entries(description).map(([name, schema]) => {
      const argNames = Object.keys(schema.args);
      const func = async (args: Record<string, unknown>): Promise<unknown> => {
        try {
          return await invoke(
            name,
            argNames.map((argName) => args[argName]),
          );
        } catch (error) {
          // The exo's interface guard is the sole argument enforcer, so a shape
          // mismatch rejects here before the implementation runs — but that is
          // indistinguishable from an error thrown by the implementation, so
          // the signature is reported as context, not a diagnosed cause.
          // Wrapping also guarantees a real `Error` even when the guard rejects
          // with an opaque value (e.g. under the test shim), so every caller
          // gets the method signature to surface to the model.
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(
            `Error calling ${formatSignature(name, schema)}: ${detail}`,
          );
        }
      };
      return [name, { func, schema }] as [
        string,
        CapabilitySpec<never, unknown>,
      ];
    }),
  );

/**
 * Discover the capabilities of a (possibly remote) discoverable exo. Fetches the
 * schema over an eventual-send boundary and creates capabilities that invoke the
 * exo's methods the same way.
 *
 * @param exo - The discoverable exo to convert to a capability record.
 * @returns A promise for a capability record.
 */
export const discover = async (
  exo: DiscoverableExo,
): Promise<CapabilityRecord> => {
  // @ts-expect-error - E type doesn't remember method names
  const description = (await E(exo)[GET_DESCRIPTION]()) as Record<
    string,
    MethodSchema
  >;
  return capabilitiesFrom(description, async (method, positionalArgs) =>
    // @ts-expect-error - E type doesn't remember method names
    E(exo)[method](...positionalArgs),
  );
};

/**
 * Construct an in-realm capability record from a guard+schema description and
 * the method implementations, building (and then keeping private) the
 * pattern-guarded exo that enforces the argument shape on every call.
 *
 * Unlike {@link discover}, this never crosses an eventual-send boundary and
 * never reads `GET_DESCRIPTION`: the schemas are the ones just authored with the
 * `described*()` combinators (`@metamask/kernel-utils`), so there is no
 * round-trip through the exo to recover what the caller already holds. The exo
 * is used purely as the in-realm enforcement membrane and is not surfaced —
 * internal capabilities are guarded closures, not passable exos. To expose a
 * capability across a boundary, publish a {@link DiscoverableExo} and
 * {@link discover} it instead.
 *
 * @param name - The exo/interface name.
 * @param methods - The method implementations, keyed by method name.
 * @param described - The interface guard and per-method schemas, e.g. from
 * `S.interface(...)`.
 * @returns A capability record keyed by the method names.
 */
export const makeInternalCapabilities = <Method extends string>(
  name: string,
  methods: Record<Method, (...args: never[]) => Promise<unknown>>,
  described: DescribedInterface,
): CapabilityRecord<Method> => {
  const { interfaceGuard, schemas } = described;
  // The implementation and schema method sets must match exactly. A missing
  // implementation already throws inside `makeDiscoverableExo`, but an extra
  // implementation absent from the schema is silently accepted by the guard's
  // `defaultGuards: 'passable'` and would never be reachable as a capability.
  // Catch both here so an authoring typo (e.g. `serch` vs `search`) fails loudly
  // at construction instead of surfacing as a capability that resolves to
  // `undefined`.
  const missing = Object.keys(schemas).filter((method) => !(method in methods));
  const extra = Object.keys(methods).filter((method) => !(method in schemas));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `makeInternalCapabilities("${name}"): implementation and schema method names must match. ` +
        `Schema methods without an implementation: [${missing.join(', ')}]; ` +
        `implementations without a schema: [${extra.join(', ')}].`,
    );
  }
  const exo = makeDiscoverableExo(
    name,
    methods as Record<string, (...args: unknown[]) => unknown>,
    schemas,
    interfaceGuard,
  );
  const dispatch = exo as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  // Dispatch as a member call so the exo method keeps its `this` binding. The
  // construction check above guarantees `method` is present, so the optional
  // chain never short-circuits in practice.
  return capabilitiesFrom(schemas, (method, positionalArgs) =>
    dispatch[method]?.(...positionalArgs),
  ) as CapabilityRecord<Method>;
};
