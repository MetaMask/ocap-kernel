import { capabilityFactory as fetchCapabilityFactory } from './capabilities/fetch/nodejs.ts';
import { capabilityFactory as fsCapabilityFactory } from './capabilities/fs/nodejs.ts';
import { makePlatformFactory } from './factory.ts';

export const makePlatform = makePlatformFactory({
  fetch: fetchCapabilityFactory,
  fs: fsCapabilityFactory,
});
