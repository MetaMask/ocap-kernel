import { capabilityFactory as fetchCapabilityFactory } from './capabilities/fetch/browser.ts';
import { capabilityFactory as fsCapabilityFactory } from './capabilities/fs/browser.ts';
import { makePlatformFactory } from './factory.ts';

export const makePlatform = makePlatformFactory({
  fetch: fetchCapabilityFactory,
  fs: fsCapabilityFactory,
});
