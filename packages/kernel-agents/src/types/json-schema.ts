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
  type: 'object';
  description?: string;
  properties: {
    [key: string]: JsonSchema;
  };
  required?: string[];
  additionalProperties?: boolean;
};
