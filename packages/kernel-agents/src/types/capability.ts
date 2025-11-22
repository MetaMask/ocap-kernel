import type { JsonSchema } from './json-schema.ts';

export type Capability<Args extends Record<string, unknown>, Return = null> = (
  args: Args,
) => Promise<Return>;

export type CapabilitySchema<ArgNames extends string> = {
  description: string;
  args: Record<ArgNames, JsonSchema>;
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
