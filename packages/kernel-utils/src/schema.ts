/**
 * JSON Schema type for describing values. Supports primitives, arrays, objects,
 * and object interfaces (i.e. an object with methods you can invoke),
 * with recursive definitions.
 */
export type JsonSchema =
  | PrimitiveJsonSchema
  | ArrayJsonSchema
  | ObjectJsonSchema
  | InterfaceJsonSchema;

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
 * Schema describing an object interface — a reference to an object whose
 * methods can be invoked. Used as the return-type schema for methods that
 * hand back an object reference (whether local or across a boundary), so
 * a client can learn the returned object's API inline from the parent
 * description without an extra round-trip.
 *
 * The `methods` field is recursive: any method here can itself return an
 * interface, and so on.
 *
 * Naming note: this schema describes an object interface. Whether the
 * reference to that object is unforgeable (i.e. an ocap in the strict
 * sense) is a property of the reference plumbing (which vat holds it,
 * whether it crossed a CapTP boundary, etc.), not of the interface
 * description itself. Same schema either way.
 */
type InterfaceJsonSchema = {
  type: 'interface';
  description?: string;
  methods: {
    [key: string]: MethodSchema;
  };
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
