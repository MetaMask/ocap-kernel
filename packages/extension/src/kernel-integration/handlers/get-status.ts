import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler } from '../command-registry.ts';
import { KernelCommandPayloadStructs } from '../messages.ts';

type GetStatusMethod = 'getStatus';

export const getStatusHandler: CommandHandler<GetStatusMethod> = {
  method: 'getStatus',
  schema: KernelCommandPayloadStructs.getStatus.schema.params,
  implementation: async (kernel: Kernel): Promise<Json> => {
    return {
      vats: kernel.getVats(),
      clusterConfig: kernel.clusterConfig,
    } as Json;
  },
};
