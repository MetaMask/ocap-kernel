/**
 * Gets a URL parameter from the current window or worker context.
 *
 * @param param - The name of the parameter to get.
 * @returns The value of the parameter or 'unknown' if not found.
 */
export const getUrlParam = (param: string): string => {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param) ?? 'unknown';
  }

  // In worker context
  const { searchParams } = new URL(self.location.href);
  return searchParams.get(param) ?? 'unknown';
};
