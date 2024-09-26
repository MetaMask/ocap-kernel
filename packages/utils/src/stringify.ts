/**
 * Stringify an evaluation result.
 *
 * @param value - The result to stringify.
 * @returns The stringified result.
 */
export const stringify = (value: unknown): string => {
  try {
    const result = JSON.stringify(value, null, 2);
    if (result === undefined) {
      return String(value);
    }
    return result;
  } catch {
    return String(value);
  }
};
