import type { Struct, Infer, AnyStruct } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

export type CapabilitySpecification<
  ConfigStruct extends AnyStruct,
  Value,
  Options extends Record<string, unknown> = Record<string, unknown>,
> = Infer<
  Struct<
    {
      configStruct: ConfigStruct;
      capabilityFactory: (
        config: Infer<ConfigStruct>,
        options?: Options,
      ) => Value;
    },
    'CapabilitySpecification'
  >
>;

/**
 * Creates a capability specification from a configuration structure and a factory function.
 *
 * @param configStruct - The configuration structure for the capability
 * @param capabilityFactory - The factory function that creates the capability
 * @returns An object containing the configuration structure and the factory function
 */
export const makeCapabilitySpecification = <
  ConfigStruct extends AnyStruct,
  Value,
  Options extends Record<string, unknown> = Record<string, unknown>,
>(
  // configStruct must be a JSON-serializable struct
  configStruct: ConfigStruct extends AnyStruct
    ? Infer<ConfigStruct> extends Json
      ? ConfigStruct
      : never
    : never,
  capabilityFactory: (config: Infer<ConfigStruct>, options?: Options) => Value,
): CapabilitySpecification<ConfigStruct, Value, Options> => {
  return {
    configStruct,
    capabilityFactory,
  };
};
