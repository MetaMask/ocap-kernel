import type { JsonSchema } from '@metamask/kernel-utils';

export type Capability<Args extends Record<string, unknown>, Return = null> = (
  args: Args,
) => Promise<Return>;

/**
 * The schema for a capability's arguments: a standard object JSON Schema whose
 * `properties` are keyed by argument name. `required` lists the mandatory
 * arguments (object-level, per JSON Schema); when omitted, all arguments are
 * treated as required.
 */
export type CapabilityArgsSchema<ArgNames extends string> = {
  type: 'object';
  description?: string;
  properties: Record<ArgNames, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
};

export type CapabilitySchema<ArgNames extends string> = {
  description: string;
  args: CapabilityArgsSchema<ArgNames>;
  returns?: JsonSchema;
};

export type ExtractRecordKeys<Rec> =
  Rec extends Record<infer Key, unknown> ? Key : never;

export type CapabilitySpec<
  Args extends Record<string, unknown> = Record<string, unknown>,
  Return = void,
> = {
  func: Capability<Args, Return>;
  schema: CapabilitySchema<ExtractRecordKeys<Args>>;
};

export type CapabilityRecord<Keys extends string = string> = Record<
  Keys,
  CapabilitySpec<never, unknown>
>;
