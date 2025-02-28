import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import { KernelCommandPayloadStructs } from '../messages.js';

export const terminateVatHandler: CommandHandler<'terminateVat'> = {
  method: 'terminateVat',
  schema: KernelCommandPayloadStructs.terminateVat.schema.params,
  implementation: async (
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams['terminateVat'],
  ): Promise<Json> => {
    await kernel.terminateVat(params.id);
    return null;
  },
};
