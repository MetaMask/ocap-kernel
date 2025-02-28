import type { Json } from '@metamask/utils';
import type { ClusterConfig, Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';

import type { CommandHandler } from '../command-registry.js';
import { KernelCommandPayloadStructs } from '../messages.js';

export const updateClusterConfigHandler: CommandHandler<'updateClusterConfig'> =
  {
    method: 'updateClusterConfig',
    schema: KernelCommandPayloadStructs.updateClusterConfig.schema.params,
    implementation: async (
      kernel: Kernel,
      _kvStore: KVStore,
      params: { config: ClusterConfig },
    ): Promise<Json> => {
      kernel.clusterConfig = params.config;
      return null;
    },
  };
