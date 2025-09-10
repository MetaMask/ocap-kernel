/**
 * Create a new record that is the disjoint union of the given records.
 *
 * @param records - The records to union.
 * @returns The disjoint union of the given records.
 * @throws If a key is found in multiple records.
 */
export const mergeDisjointRecords = (
  ...records: Record<PropertyKey, unknown>[]
): Record<PropertyKey, unknown> => {
  const keys = new Map<PropertyKey, number>();
  const out: Record<PropertyKey, unknown> = Object.create(null);
  records.forEach((record, collidingIndex) => {
    for (const key of Reflect.ownKeys(record)) {
      if (keys.has(key)) {
        const originalIndex = keys.get(key);
        throw new Error(
          `Duplicate keys in records: ${String(key)}, found in entries ${originalIndex} and ${collidingIndex}`,
          { cause: { originalIndex, collidingIndex, key } },
        );
      }
      keys.set(key, collidingIndex);
      const desc = Object.getOwnPropertyDescriptor(record, key);
      if (desc) {
        Object.defineProperty(out, key, desc);
      } else {
        out[key] = record[key];
      }
    }
  });
  return out;
};
