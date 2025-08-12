/**
 * XXX To provide a complete object capability encapsulation, this code should
 * be passed into a vat as an endowment, the Ollama constructor should be
 * imported from ollama within the vat, the endowed fetch should be passed to
 * the Ollama constructor, and the vat should expose a remotable presence to
 * the ollama client.
 *
 * As is, the security model relies on the ollama library only using the fetch
 * function provided to the constructor, but a malicious ollama library could
 * use the fetch function from global scope to make requests to other hosts.
 */

/**
 * Creates a fetch function that only allows requests to the specified origins.
 *
 * @param allowedHosts - The hosts to allow requests from.
 * @param baseFetch - The fetch function to use as a base. Defaults to the global fetch function.
 * @returns A fetch function that only allows requests to the specified hosts.
 */
export const makeHostRestrictedFetch = (
  allowedHosts: string[],
  baseFetch: typeof fetch = globalThis.fetch,
): typeof fetch => {
  const restrictedFetch = async (
    ...[url, ...args]: Parameters<typeof fetch>
  ): ReturnType<typeof fetch> => {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const { host } = new URL(url instanceof Request ? url.url : url);
    if (!allowedHosts.includes(host)) {
      throw new Error(
        `Invalid host: ${host}, expected: ${allowedHosts.join(', ')}`,
        { cause: { url } },
      );
    }
    const response = await baseFetch(url, ...args);
    return response;
  };
  return harden(restrictedFetch);
};
