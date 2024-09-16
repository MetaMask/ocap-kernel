// Utilitous generic types.

/**
 * An object type mapping keys to `ValueType`.
 * A type which extends `TypeMap<SpecificKeys, unknown>` can map each key to a different type.
 */
export type TypeMap<Keys extends string, ValueType = unknown> = {
  [key in Keys]: ValueType;
};

/**
 * Omit from `ObjectType` all keys without the specified `ValueType`.
 */
type PickByValue<ObjectType, ValueType> = Pick<
  ObjectType,
  {
    [K in keyof ObjectType]: ObjectType[K] extends ValueType ? K : never;
  }[keyof ObjectType]
>;

/**
 * The result type of calling `Object.entries` on an object of type `ObjectType`.
 *
 * WARNING: If an object is typed as `ObjectType` but has excess properties,
 * `Entries<typeof object>` will incorrectly omit the entries corresponding to the
 * excess properties. Ensure your assumptions about the object align with typescript's.
 * To be safe, use a type guard or only apply to objects you have declared.
 *
 * See https://www.typescriptlang.org/docs/handbook/2/objects.html#excess-property-checks
 * for a description of excess properties.
 */
export type Entries<ObjectType> = {
  [K in keyof ObjectType]: [
    keyof PickByValue<ObjectType, ObjectType[K]>,
    ObjectType[K],
  ];
}[keyof ObjectType][];
