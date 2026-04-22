export type FetchCapability = typeof fetch;

export type FetchCaveat = (
  ...args: Parameters<FetchCapability>
) => Promise<void>;

/**
 * Resolve the target URL from a fetch input argument. Accepts the same input
 * shapes as `fetch` itself (string, URL, or Request).
 *
 * @param arg - The input to resolve.
 * @returns The resolved URL.
 */
export const resolveUrl = (arg: Parameters<typeof fetch>[0]): URL =>
  new URL(arg instanceof Request ? arg.url : arg);

/**
 * Build a caveat that rejects fetches whose host is not in `allowedHosts`.
 * `file://` URLs are passed through since they have no host component.
 *
 * @param allowedHosts - The allowed hosts.
 * @returns A caveat that restricts fetch to the allowed hosts.
 */
export const makeHostCaveat = (allowedHosts: string[]): FetchCaveat => {
  return harden(async (...args: Parameters<typeof fetch>) => {
    const { host, protocol } = resolveUrl(args[0]);
    if (protocol === 'file:') {
      return;
    }
    if (!allowedHosts.includes(host)) {
      throw new Error(`Invalid host: ${host}`);
    }
  });
};

/**
 * Wrap a fetch capability so a caveat runs before every call. The caveat may
 * throw to reject the request; a throw prevents the underlying fetch from
 * being invoked.
 *
 * @param baseFetch - The fetch capability to wrap.
 * @param caveat - The caveat to apply before each call.
 * @returns A fetch capability gated by the caveat.
 */
export const makeCaveatedFetch = (
  baseFetch: FetchCapability,
  caveat: FetchCaveat,
): FetchCapability => {
  return harden(async (...args: Parameters<FetchCapability>) => {
    await caveat(...args);
    return await baseFetch(...args);
  });
};
