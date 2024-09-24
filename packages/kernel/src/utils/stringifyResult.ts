/**
 * Stringify an evaluation result.
 *
 * @param value - The result to stringify.
 * @returns The stringified result.
 */
export const stringifyResult = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
