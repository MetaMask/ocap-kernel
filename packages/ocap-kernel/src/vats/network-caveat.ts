import { resolveFetchInput } from '@metamask/kernel-utils';

export type FetchCapability = typeof fetch;

/**
 * A gate run before every fetch. It receives the URL that `fetch` will
 * actually request — never the caller's raw input — so that it cannot be
 * fooled into approving one URL while another is requested.
 */
type FetchCaveat = (url: URL, init?: RequestInit) => Promise<void>;

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
  return harden(async ({ hostname, protocol }: URL) => {
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
 * The caller's input is resolved to a URL exactly once and replaced with a
 * stand-in that resolves to nothing else, so the URL the caveat approves is
 * the URL `baseFetch` requests.
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
    const [rawInput, ...rest] = args;
    const { url, input } = resolveFetchInput(rawInput);
    await caveat(url, ...rest);
    return await baseFetch(input, ...rest);
  });
};
