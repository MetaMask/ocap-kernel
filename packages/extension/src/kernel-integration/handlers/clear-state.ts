import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler } from '../command-registry.ts';
import { KernelCommandPayloadStructs } from '../messages.ts';

export const clearStateHandler: CommandHandler<'clearState'> = {
  method: 'clearState',
  schema: KernelCommandPayloadStructs.clearState.schema.params,
  implementation: async (kernel: Kernel): Promise<Json> => {
    await kernel.reset();
    return null;
  },
};
