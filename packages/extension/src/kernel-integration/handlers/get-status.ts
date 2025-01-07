import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type GetStatusMethod = typeof KernelControlMethod.getStatus;

export const getStatusHandler: CommandHandler<GetStatusMethod> = {
  schema: KernelCommandPayloadStructs.getStatus.schema.params,

  async execute(kernel: Kernel): Promise<Json> {
    return {
      vats: kernel.getVats(),
    };
  },
};
