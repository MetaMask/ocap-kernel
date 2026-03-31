import {
  array,
  assert,
  boolean,
  define,
  number,
  object,
  optional,
  string,
  StructError,
} from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';

import type { JsonSchema } from './schema.ts';

type ObjectJsonSchema = Extract<JsonSchema, { type: 'object' }>;

/**
 * Object schema where unknown property names are allowed (when `additionalProperties` is not `false`).
 * Known properties are validated; required keys must be present.
 *
 * @param schema - JSON Schema with `type: 'object'`, `properties`, and optional `required`.
 * @returns A Superstruct validator for plain objects matching the loose object rules.
 */
function looseObjectStruct(schema: ObjectJsonSchema): Struct<unknown> {
  const { properties } = schema;
  const required = new Set(schema.required ?? Object.keys(properties));
  return define('JsonSchemaObject', (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return 'Expected a plain object';
    }
    const obj = value as Record<string, unknown>;
    for (const key of required) {
      if (!(key in obj)) {
        return `Missing required property "${key}"`;
      }
    }
    for (const [key, subSchema] of Object.entries(properties)) {
      if (!(key in obj)) {
        continue;
      }
      try {
        assert(obj[key], jsonSchemaToStruct(subSchema));
      } catch (caught) {
        if (caught instanceof StructError) {
          return `At ${key}: ${caught.message}`;
        }
        throw caught;
      }
    }
    return true;
  }) as Struct<unknown>;
}

/**
 * Build a Superstruct {@link Struct} from our {@link JsonSchema} subset (primitives,
 * arrays, objects). Used to reuse Superstruct validation for values described by
 * discoverable exo / capability {@link MethodSchema} argument shapes.
 *
 * @param schema - JSON Schema value (must include `type`).
 * @returns A struct that validates the same shapes as the prior hand-rolled checks.
 */
export function jsonSchemaToStruct(schema: JsonSchema): Struct<unknown> {
  switch (schema.type) {
    case 'string':
      return string() as Struct<unknown>;
    case 'number':
      return number() as Struct<unknown>;
    case 'boolean':
      return boolean() as Struct<unknown>;
    case 'array':
      return array(jsonSchemaToStruct(schema.items)) as Struct<unknown>;
    case 'object': {
      const { properties } = schema;
      const required = new Set(schema.required ?? Object.keys(properties));
      const shape = Object.fromEntries(
        Object.entries(properties).map(([key, subSchema]) => {
          const fieldStruct = jsonSchemaToStruct(subSchema);
          return [key, required.has(key) ? fieldStruct : optional(fieldStruct)];
        }),
      );
      if (schema.additionalProperties === false) {
        return object(shape) as Struct<unknown>;
      }
      if (Object.keys(properties).length === 0) {
        return looseObjectStruct(schema);
      }
      return looseObjectStruct(schema);
    }
    default: {
      const _never: never = schema;
      throw new TypeError(`Unsupported JSON schema: ${String(_never)}`);
    }
  }
}

/**
 * Build a Superstruct object struct for a method/capability `args` map
 * (name → per-argument {@link JsonSchema}). All listed arguments are required.
 *
 * @param args - Same shape as {@link MethodSchema.args}.
 * @returns A struct that validates a plain object with one field per declared argument.
 */
export function methodArgsToStruct(
  args: Record<string, JsonSchema>,
): Struct<Record<string, unknown>> {
  const entries = Object.entries(args);
  if (entries.length === 0) {
    return define('EmptyCapabilityArgs', (value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return 'Expected a plain object';
      }
      return true;
    }) as Struct<Record<string, unknown>>;
  }
  const shape = Object.fromEntries(
    entries.map(([name, jsonSchema]) => [name, jsonSchemaToStruct(jsonSchema)]),
  );
  return object(shape) as Struct<Record<string, unknown>>;
}
