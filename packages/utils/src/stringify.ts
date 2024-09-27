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
      const errorObject: Record<string, unknown> = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };

      if (value.cause instanceof Error) {
        errorObject.cause = {
          name: value.cause.name,
          message: value.cause.message,
        };
      }

      return JSON.stringify(errorObject, null, indent);
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
