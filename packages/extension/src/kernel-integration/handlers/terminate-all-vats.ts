import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type TerminateAllVatsMethod = typeof KernelControlMethod.terminateAllVats;

export const terminateAllVatsHandler: CommandHandler<TerminateAllVatsMethod> = {
  method: KernelControlMethod.terminateAllVats,
  schema: KernelCommandPayloadStructs.terminateAllVats.schema.params,
  implementation: async (kernel: Kernel): Promise<Json> => {
    await kernel.terminateAllVats();
    return null;
  },
};
