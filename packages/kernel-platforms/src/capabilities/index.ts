import { object, exactOptional } from '@metamask/superstruct';

import { fetchConfigStruct } from './fetch/types.ts';
import type { FetchCapability, FetchConfig } from './fetch/types.ts';
import { fsConfigStruct } from './fs/types.ts';
import type { FsCapability, FsConfig } from './fs/types.ts';

/**
 * Registry of all platform capabilities (platform-agnostic)
 */
export type PlatformCapabilityRegistry = {
  fetch: {
    config: FetchConfig;
    capability: FetchCapability;
  };
  fs: {
    config: FsConfig;
    capability: FsCapability;
  };
};

// Create validation struct for PlatformConfig
export const platformConfigStruct = object({
  fetch: exactOptional(fetchConfigStruct),
  fs: exactOptional(fsConfigStruct),
});
