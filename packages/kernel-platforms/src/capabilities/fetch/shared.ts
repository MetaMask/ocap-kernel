import type { FetchCapability, FetchCaveat, FetchConfig } from './types.ts';

/**
 * Cross-platform URL resolution utility
 *
 * @param arg - The input to resolve
 * @returns The resolved URL
 */
export const resolveUrl = (arg: Parameters<typeof fetch>[0]): URL =>
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  new URL(arg instanceof Request ? arg.url : arg);

/**
 * Cross-platform host caveat factory
 *
 * @param allowedHosts - The allowed hosts
 * @returns A caveat that restricts the fetch to only the allowed hosts
 */
export const makeHostCaveat = (allowedHosts: string[]): FetchCaveat => {
  return harden(async (...args: Parameters<typeof fetch>) => {
    const { host, protocol } = resolveUrl(args[0]);
    // Allow file:// URLs to pass through
    if (protocol === 'file:') {
      return;
    }
    if (!allowedHosts.includes(host)) {
      throw new Error(`Invalid host: ${host}`);
    }
  });
};

/**
 * Cross-platform fetch caveat factory
 *
 * @param config - The configuration for the fetch caveat
 * @returns A caveat that restricts a fetch capability according to the specified configuration
 */
export const makeFetchCaveat = (config: FetchConfig): FetchCaveat => {
  const { allowedHosts = [] } = config;
  return makeHostCaveat(allowedHosts);
};

/**
 * Cross-platform fetch caveat wrapper
 *
 * @param baseFetch - The underlying fetch capability to wrap
 * @param caveat - The caveat to apply to the fetch capability
 * @returns A fetch capability restricted by the provided caveat
 */
export const makeCaveatedFetch = (
  baseFetch: FetchCapability,
  caveat: FetchCaveat,
): FetchCapability => {
  return harden(async (...args: Parameters<FetchCapability>) => {
    await caveat(...args);
    const response = await baseFetch(...args);
    return response;
  });
};
