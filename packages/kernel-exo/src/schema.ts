/**
 * JSON Schema type for describing values. Supports primitives, arrays, and objects
 * with recursive definitions.
 */
export type JsonSchema =
  | PrimitiveJsonSchema
  | ArrayJsonSchema
  | ObjectJsonSchema;

/**
 * Primitive JSON Schema types (string, number, boolean).
 */
type PrimitiveJsonSchema = {
  type: 'string' | 'number' | 'boolean';
  description?: string;
};

/**
 * Array JSON Schema with recursive item type.
 */
type ArrayJsonSchema = {
  type: 'array';
  description?: string;
  items: JsonSchema;
};

/**
 * Object JSON Schema with recursive property definitions.
 */
type ObjectJsonSchema = {
  type: 'object';
  description?: string;
  properties: {
    [key: string]: JsonSchema;
  };
  required?: string[];
  additionalProperties?: boolean;
};

/**
 * Schema describing a method, including its purpose, arguments, and return value.
 */
export type MethodSchema = {
  /**
   * Description of the method's purpose and behavior.
   */
  description: string;
  /**
   * Arguments of the method, keyed by argument name.
   * Each argument includes its type and description.
   */
  args: Record<string, JsonSchema>;
  /**
   * Return value schema, including type and description.
   */
  returns?: JsonSchema;
};
