import { readFile } from 'node:fs/promises';

import { makeFetchCaveat, makeCaveatedFetch } from './shared.ts';
import { fetchConfigStruct } from './types.ts';
import type { FetchCapability, FetchConfig } from './types.ts';
import { makeCapabilitySpecification } from '../../specification.ts';

/**
 * Extends the fetch capability with file:// URL support for Node.js
 *
 * @param fromFetch - The underlying fetch capability to wrap
 * @returns A fetch capability with file:// URL support
 */
const makeExtendedFetch = (fromFetch: FetchCapability): FetchCapability => {
  return async (...[input, ...args]: Parameters<FetchCapability>) => {
    const url = input instanceof Request ? input.url : input;
    const { protocol, pathname } = new URL(url);

    if (protocol === 'file:') {
      const contents = await readFile(pathname, 'utf8');

      return new Response(contents);
    }

    return await fromFetch(input, ...args);
  };
};

export const { configStruct, capabilityFactory } = makeCapabilitySpecification(
  fetchConfigStruct,
  (
    config: FetchConfig,
    options?: { fromFetch: FetchCapability },
  ): FetchCapability => {
    if (!options?.fromFetch) {
      throw new Error('Must provide explicit fromFetch capability');
    }
    const { fromFetch } = options;
    const caveat = makeFetchCaveat(config);
    const extendedFetch = makeExtendedFetch(fromFetch);
    return makeCaveatedFetch(extendedFetch, caveat);
  },
);
