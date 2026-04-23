import { capabilityFactory as fsCapabilityFactory } from './capabilities/fs/browser.ts';
import { makePlatformFactory } from './factory.ts';

export const makePlatform = makePlatformFactory({
  fs: fsCapabilityFactory,
});
