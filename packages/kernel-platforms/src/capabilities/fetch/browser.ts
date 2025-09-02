import { makeFetchCaveat, makeCaveatedFetch } from './shared.ts';
import { fetchConfigStruct } from './types.ts';
import type { FetchCapability, FetchConfig } from './types.ts';
import { makeCapabilitySpecification } from '../../specification.ts';

export const { configStruct, capabilityFactory } = makeCapabilitySpecification(
  fetchConfigStruct,
  (config: FetchConfig): FetchCapability => {
    const caveat = makeFetchCaveat(config);
    return makeCaveatedFetch(globalThis.fetch, caveat);
  },
);
