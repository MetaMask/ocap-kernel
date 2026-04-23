export type FetchCapability = typeof fetch;

type FetchCaveat = (...args: Parameters<FetchCapability>) => Promise<void>;

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
 * Build a caveat that rejects fetches whose hostname is not in
 * `allowedHosts`. Matching is a case-sensitive exact comparison against
 * `URL.hostname` — **ports and schemes are not considered**, so
 * `allowedHosts: ['api.example.com']` accepts `http://api.example.com`,
 * `https://api.example.com`, and `https://api.example.com:8443` alike.
 *
 * `file://` URLs are rejected outright: vats that need local file access
 * must use the `fs` platform capability, not fetch. This avoids the footgun
 * where a vat that opts into `fetch` for HTTP requests inadvertently gains
 * unrestricted filesystem read access.
 *
 * @param allowedHosts - The allowed hostnames.
 * @returns A caveat that restricts fetch to the allowed hostnames.
 */
export const makeHostCaveat = (allowedHosts: string[]): FetchCaveat => {
  return harden(async (...args: Parameters<typeof fetch>) => {
    const { hostname, protocol } = resolveUrl(args[0]);
    if (protocol === 'file:') {
      throw new Error(
        `fetch cannot target file:// URLs. Use the fs platform capability ` +
          `(VatConfig.platformConfig.fs) for filesystem access.`,
      );
    }
    if (!allowedHosts.includes(hostname)) {
      throw new Error(`Invalid host: ${hostname}`);
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
