import { makeGuardedFetch } from '@metamask/kernel-utils';
import type { FetchGuard } from '@metamask/kernel-utils';

export type FetchCapability = typeof fetch;

/** A vat-facing name for {@link FetchGuard}. */
type FetchCaveat = FetchGuard;

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
 * Wrap a fetch capability so a caveat runs before every request it makes,
 * rejecting the fetch if it throws. See {@link makeGuardedFetch}, which
 * resolves the input once and re-runs the caveat on every redirect hop.
 *
 * @param baseFetch - The fetch capability to wrap.
 * @param caveat - The caveat to apply before each request.
 * @returns A fetch capability gated by the caveat.
 */
export const makeCaveatedFetch = (
  baseFetch: FetchCapability,
  caveat: FetchCaveat,
): FetchCapability => makeGuardedFetch({ baseFetch, guard: caveat });
