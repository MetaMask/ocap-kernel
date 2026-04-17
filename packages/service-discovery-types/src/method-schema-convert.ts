/**
 * One-way converter from the `MethodSchema`/`JsonSchema` types used by
 * `makeDiscoverableExo` (in `@metamask/kernel-utils`) into the richer
 * `TypeSpec` / `ObjectSpec` / `RemotableSpec` / `MethodSpec` shape used in
 * {@link ServiceDescription}.
 *
 * The conversion is lossy in the following ways:
 *
 * - `MethodSchema.args` is an unordered map of named parameters; the target
 *   `MethodSpec.parameters` is an ordered array of unnamed `ValueSpec`s. We
 *   use the iteration order of the args record, and we drop the names. The
 *   names are preserved as `ValueSpec.description` if no description was
 *   otherwise present, so they remain human-readable.
 * - `MethodSchema` does not mark individual args as optional; the converter
 *   treats all parameters as required.
 * - `JsonSchema` has no notion of `remotable`, `null`, `void`, `bigint`,
 *   `unknown`, or `union`. The converter never emits those kinds.
 */

import type { JsonSchema, MethodSchema } from '@metamask/kernel-utils';

import type {
  MethodSpec,
  ObjectSpec,
  RemotableSpec,
  TypeSpec,
  ValueSpec,
} from './service-description.ts';

/**
 * Convert a `JsonSchema` to a `TypeSpec`.
 *
 * @param schema - The source JsonSchema.
 * @returns The equivalent TypeSpec.
 */
export function jsonSchemaToTypeSpec(schema: JsonSchema): TypeSpec {
  switch (schema.type) {
    case 'string':
    case 'number':
    case 'boolean':
      return { kind: schema.type };
    case 'array':
      return {
        kind: 'array',
        elementType: jsonSchemaToTypeSpec(schema.items),
      };
    case 'object':
      return {
        kind: 'object',
        spec: jsonSchemaToObjectSpec(schema),
      };
    default: {
      // Exhaustive: JsonSchema is a closed union.
      const unreachable: never = schema;
      throw new Error(`Unsupported JsonSchema: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * Convert an object-typed `JsonSchema` to an `ObjectSpec`.
 *
 * @param schema - The source object-typed JsonSchema.
 * @returns The equivalent ObjectSpec.
 */
export function jsonSchemaToObjectSpec(
  schema: Extract<JsonSchema, { type: 'object' }>,
): ObjectSpec {
  const required = new Set(schema.required ?? []);
  const properties: Record<string, ValueSpec> = {};
  for (const [name, propSchema] of Object.entries(schema.properties)) {
    const propSpec: ValueSpec = { type: jsonSchemaToTypeSpec(propSchema) };
    if (propSchema.description !== undefined) {
      propSpec.description = propSchema.description;
    }
    if (!required.has(name)) {
      propSpec.optional = true;
    }
    properties[name] = propSpec;
  }
  const out: ObjectSpec = { properties };
  if (schema.description !== undefined) {
    out.description = schema.description;
  }
  if (schema.additionalProperties) {
    out.extensible = true;
  }
  return out;
}

/**
 * Convert a `MethodSchema` to a `MethodSpec`.
 *
 * Because `MethodSchema.args` is a named record while `MethodSpec.parameters`
 * is a positional array, the parameters are emitted in the iteration order of
 * the args record, and each parameter's name is preserved in its
 * `description` field when the source did not supply one.
 *
 * @param schema - The source MethodSchema.
 * @returns The equivalent MethodSpec.
 */
export function methodSchemaToMethodSpec(schema: MethodSchema): MethodSpec {
  const parameters: ValueSpec[] = [];
  for (const [name, argSchema] of Object.entries(schema.args)) {
    const type = jsonSchemaToTypeSpec(argSchema);
    const description = argSchema.description ?? name;
    parameters.push({ description, type });
  }
  const returnType: TypeSpec = schema.returns
    ? jsonSchemaToTypeSpec(schema.returns)
    : { kind: 'void' };
  return {
    description: schema.description,
    parameters,
    returnType,
  };
}

/**
 * Convert a `Record<string, MethodSchema>` (as accepted by
 * `makeDiscoverableExo`) into a `RemotableSpec`.
 *
 * @param options - Conversion options.
 * @param options.methods - The source methods record.
 * @param options.description - Optional description for the resulting
 * RemotableSpec.
 * @returns The equivalent RemotableSpec.
 */
export function methodsToRemotableSpec(options: {
  methods: Record<string, MethodSchema>;
  description?: string;
}): RemotableSpec {
  const { methods, description } = options;
  const out: RemotableSpec = {
    methods: Object.fromEntries(
      Object.entries(methods).map(([name, schema]) => [
        name,
        methodSchemaToMethodSpec(schema),
      ]),
    ),
  };
  if (description !== undefined) {
    out.description = description;
  }
  return out;
}
