import { makeExo } from '@endo/exo';
import type { Methods } from '@endo/exo';
import type { InterfaceGuard } from '@endo/patterns';

import { makeDefaultInterface } from './exo.ts';
import type { MethodSchema } from './schema.ts';

// The path names for describing methods are:
// - `describe('<methodName>')` -> get the entire method schema
// - `describe('<methodName>.args')` -> get the types and descriptions for the arguments
// - `describe('<methodName>.args.<argumentName>')` -> get the type and description for the argument
// - `describe('<methodName>.returns')` -> get the type and description for the return value
// - `describe('<methodName>.returns.<property>')` -> get the type and description for a property of the return value
// - `describe()` -> get the entire schema for the discoverable exo

/**
 * A discoverable exo object that extends a base exo interface with a `describe` method
 * for runtime introspection of method schemas.
 */
type DiscoverableExo<
  Interface extends Methods,
  Schema extends Record<keyof Interface, MethodSchema> = Record<
    keyof Interface,
    MethodSchema
  >,
> = ReturnType<typeof makeExo<Interface>> & {
  /**
   * Describe the methods of the discoverable.
   *
   * @param methodNames - The names of the methods to describe. If omitted, returns the entire schema.
   * @returns A schema of the methods. If method names are provided, returns a partial schema.
   */
  describe: {
    (): Schema;
    (
      ...methodNames: (keyof Interface)[]
    ): Partial<Pick<Schema, (typeof methodNames)[number]>>;
  };
};

/**
 * Shorthand for creating a discoverable `@endo/exo` remotable with default guards set to 'passable'.
 * The keys of the schema must match the keys of the methods. By convention, the schema is exhaustive.
 * In other words, the schema is a complete description of the interface. In practice, it may be incomplete.
 *
 * @param name - The name of the discoverable.
 * @param methods - The methods of the discoverable.
 * @param schema - The schema of the discoverable, with method schemas including descriptions, arguments, and return types.
 * @param interfaceGuard - The interface guard of the discoverable.
 * @returns A discoverable exo.
 */
export const makeDiscoverableExo = <
  Interface extends Methods,
  Schema extends Record<keyof Interface, MethodSchema> = Record<
    keyof Interface,
    MethodSchema
  >,
>(
  name: string,
  methods: Interface,
  schema: Schema,
  interfaceGuard: InterfaceGuard = makeDefaultInterface(name),
): DiscoverableExo<Interface, Schema> =>
  // @ts-expect-error We're intentionally not specifying method-specific interface guards.
  makeExo(name, interfaceGuard, {
    ...methods,
    /**
     * Describe the methods of the discoverable.
     *
     * @param methodNames - The names of the methods to describe.
     * @returns A partial schema of the methods.
     */
    describe: (...methodNames: (keyof Interface)[]) => {
      if (methodNames.length === 0) {
        return schema;
      }
      return Object.fromEntries(
        methodNames.map((methodName) => [methodName, schema[methodName]]),
      ) as Partial<Pick<Schema, (typeof methodNames)[number]>>;
    },
  });
