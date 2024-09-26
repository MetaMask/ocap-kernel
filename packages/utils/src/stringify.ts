/**
 * Stringify an evaluation result.
 *
 * @param value - The result to stringify.
 * @param indent - The number of spaces to use for indentation (optional).
 * @returns The stringified result.
 */
export const stringify = (value: unknown, indent: number = 2): string => {
  try {
    if (value instanceof Error) {
      return JSON.stringify(
        {
          name: value.name,
          message: value.message,
          stack: value.stack,
        },
        null,
        indent,
      );
    }

    const result = JSON.stringify(value, null, indent);
    if (result === undefined) {
      return String(value);
    }
    return result;
  } catch {
    return String(value);
  }
};
