import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler } from '../command-registry.js';
import { KernelCommandPayloadStructs } from '../messages.js';

export const terminateAllVatsHandler: CommandHandler<'terminateAllVats'> = {
  method: 'terminateAllVats',
  schema: KernelCommandPayloadStructs.terminateAllVats.schema.params,
  implementation: async (kernel: Kernel): Promise<Json> => {
    await kernel.terminateAllVats();
    return null;
  },
};
