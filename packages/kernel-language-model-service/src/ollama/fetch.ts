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

import type { Config } from 'ollama';

/**
 * Creates a fetch function that only allows requests to the specified host.
 *
 * @param config - The configuration object containing the host to restrict requests to.
 * @returns A fetch function that only allows requests to the specified host.
 */
export const makeOriginRestrictedFetch = (config: Config): typeof fetch => {
  const { host: configuredOrigin } = config;
  const restrictedFetch = async (
    ...[url, ...args]: Parameters<typeof fetch>
  ): ReturnType<typeof fetch> => {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const { origin } = new URL(url instanceof Request ? url.url : url);
    if (origin !== configuredOrigin) {
      throw new Error(
        `Invalid origin: ${origin}, expected: ${configuredOrigin}`,
      );
    }
    const response = await fetch(url, ...args);
    return response;
  };
  harden(restrictedFetch);
  return restrictedFetch as unknown as typeof fetch;
};
