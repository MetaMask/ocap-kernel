import { ResourceLimitError } from '../errors/ResourceLimitError.ts';
import type {
  ResourceLimitType,
  ResourceLimitErrorData,
} from '../errors/ResourceLimitError.ts';

/**
 * Check if an error is a ResourceLimitError, optionally with a specific limit type.
 *
 * @param error - The error to check.
 * @param limitType - Optional limit type to match against.
 * @returns True if the error is a ResourceLimitError (with matching limitType if specified).
 */
export function isResourceLimitError(
  error: unknown,
  limitType?: ResourceLimitType,
): error is ResourceLimitError {
  if (!(error instanceof ResourceLimitError)) {
    return false;
  }

  if (limitType === undefined) {
    return true;
  }

  const data = error.data as ResourceLimitErrorData | undefined;
  return data?.limitType === limitType;
}
