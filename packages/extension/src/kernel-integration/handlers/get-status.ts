import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type GetStatusMethod = typeof KernelControlMethod.getStatus;

export const getStatusHandler: CommandHandler<GetStatusMethod> = {
  method: KernelControlMethod.getStatus,
  schema: KernelCommandPayloadStructs.getStatus.schema.params,
  implementation: async (kernel: Kernel): Promise<Json> => {
    return {
      vats: kernel.getVats(),
      clusterConfig: kernel.clusterConfig,
    } as Json;
  },
};
