import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type TerminateAllVatsMethod = typeof KernelControlMethod.terminateAllVats;

export const terminateAllVatsHandler: CommandHandler<TerminateAllVatsMethod> = {
  schema: KernelCommandPayloadStructs.terminateAllVats.schema.params,

  async execute(kernel: Kernel): Promise<Json> {
    await kernel.terminateAllVats();
    return null;
  },
};
