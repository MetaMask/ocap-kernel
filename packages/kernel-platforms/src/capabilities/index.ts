import { object, exactOptional } from '@metamask/superstruct';

import { fsConfigStruct } from './fs/types.ts';
import type { FsCapability, FsConfig } from './fs/types.ts';

/**
 * Registry of all platform capabilities (platform-agnostic)
 */
export type PlatformCapabilityRegistry = {
  fs: {
    config: FsConfig;
    capability: FsCapability;
  };
};

// Create validation struct for PlatformConfig
export const platformConfigStruct = object({
  fs: exactOptional(fsConfigStruct),
});
