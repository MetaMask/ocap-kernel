/**
 * Validates a bundle URL.
 *
 * @param url - The bundle URL to validate
 * @returns Whether the URL is a valid bundle URL
 */
export function isValidBundleUrl(url?: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname.trim().toLowerCase().endsWith('.bundle');
  } catch {
    return false;
  }
}

type ErrorResponse = {
  error: unknown;
};

/**
 * Checks if a value is an error response.
 *
 * @param value - The value to check.
 * @returns Whether the value is an error response.
 */
export function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === 'object' && value !== null && 'error' in value;
}
