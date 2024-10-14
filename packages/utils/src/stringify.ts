import type { OcapError } from '@ocap/errors';
import { isOcapError } from '@ocap/errors';

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
      const errorObject = stringifyError(value);
      return JSON.stringify(errorObject, null, indent);
    }

    const result = JSON.stringify(value, null, indent);
    return result ?? String(value);
  } catch {
    return String(value);
  }
};

/**
 * Helper function to process an error.
 *
 * @param error - The error to process.
 * @returns The processed object.
 */
function stringifyError(error: Error): Record<string, unknown> {
  return isOcapError(error)
    ? createOcapErrorObject(error)
    : createErrorObject(error);
}

/**
 * Helper function to create a simplified error object.
 *
 * @param error - The error to create an object from.
 * @returns The error object.
 */
function createErrorObject(error: Error): Record<string, unknown> {
  const errorObject: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  if (error.cause) {
    errorObject.cause =
      error.cause instanceof Error
        ? stringifyError(error.cause)
        : stringify(error.cause);
  }

  return errorObject;
}

/**
 * Helper function to create an Ocap error object.
 *
 * @param error - The Ocap error to create an object from.
 * @returns The Ocap error object.
 */
function createOcapErrorObject(error: OcapError): Record<string, unknown> {
  const errorObject = {
    ...createErrorObject(error),
    code: error.code,
    data: stringify(error.data),
  };

  return errorObject;
}
