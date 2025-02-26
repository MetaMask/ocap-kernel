import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler } from '../command-registry.js';
import { KernelCommandPayloadStructs } from '../messages.js';

export const reloadConfigHandler: CommandHandler<'reload'> = {
  method: 'reload',
  schema: KernelCommandPayloadStructs.clearState.schema.params,
  implementation: async (kernel: Kernel): Promise<Json> => {
    await kernel.reload();
    return null;
  },
};
