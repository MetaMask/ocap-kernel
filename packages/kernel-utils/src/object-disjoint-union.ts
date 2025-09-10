/**
 * Create a new object that is the disjoint union of the given objects.
 *
 * @param objects - The objects to union.
 * @returns The disjoint union of the given objects.
 * @throws If a key is found in multiple objects.
 */
export const objectDisjointUnion = (
  ...objects: Record<PropertyKey, unknown>[]
): Record<PropertyKey, unknown> => {
  const keys = new Map<PropertyKey, number>();
  const out: Record<PropertyKey, unknown> = Object.create(null);
  let collidingIndex = 0;
  for (const obj of objects) {
    for (const key of Reflect.ownKeys(obj)) {
      if (keys.has(key)) {
        const originalIndex = keys.get(key);
        throw new Error(
          `Duplicate keys in objects: ${String(key)}, found in entries ${originalIndex} and ${collidingIndex}`,
          { cause: { originalIndex, collidingIndex, key } },
        );
      }
      keys.set(key, collidingIndex);
      const desc = Object.getOwnPropertyDescriptor(obj, key);
      if (desc) {
        Object.defineProperty(out, key, desc);
      } else {
        out[key] = obj[key];
      }
    }
    collidingIndex += 1;
  }
  return out;
};
