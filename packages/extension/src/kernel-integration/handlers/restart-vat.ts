import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';

import type { CommandHandler, CommandParams } from '../command-registry.ts';
import { KernelCommandPayloadStructs } from '../messages.ts';

export const restartVatHandler: CommandHandler<'restartVat'> = {
  method: 'restartVat',
  schema: KernelCommandPayloadStructs.restartVat.schema.params,
  implementation: async (
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams['restartVat'],
  ): Promise<Json> => {
    await kernel.restartVat(params.id);
    return null;
  },
};
