/**
 * Create a new object that is the disjoint union of the given objects.
 *
 * @param objects - The objects to union.
 * @returns The disjoint union of the given objects.
 * @throws If a key is found in multiple objects.
 */
export const objectDisjointUnion = (...objects: object[]): object => {
  const keys = new Map();
  return objects.reduce((acc, obj, collidingIndex) => {
    const objKeys = Object.keys(obj);
    objKeys.forEach((key) => {
      if (keys.has(key)) {
        const originalIndex = keys.get(key);
        throw new Error(
          `Duplicate keys in objects: ${key}, found in entries ${originalIndex} and ${collidingIndex}`,
          { cause: { originalIndex, collidingIndex, key } },
        );
      }
      keys.set(key, collidingIndex);
    });
    return { ...acc, ...obj };
  }, {});
};
