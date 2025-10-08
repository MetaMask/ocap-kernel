import type { Transcript } from './messages.ts';

export type JsonSchema =
  | PrimitiveJsonSchema
  | ArrayJsonSchema
  | ObjectJsonSchemaProperty;

type PrimitiveJsonSchema = {
  type: 'string' | 'number' | 'boolean';
  description?: string;
};

type ArrayJsonSchema = {
  type: 'array';
  description?: string;
  item: JsonSchema;
};

type ObjectJsonSchemaProperty = {
  type: 'string' | 'number' | 'boolean';
  description?: string;
  properties: {
    [key: string]: JsonSchema;
  };
  required?: string[];
  additionalProperties?: boolean;
};

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

export type Agent = {
  task: (
    prompt: string,
    options?: { invocationBudget?: number },
  ) => Promise<unknown>;
};

export type Chat = {
  getPromptAndPrefix: () => { prompt: string; prefix: string };
  pushMessages: (...messages: Transcript) => void;
};
