import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type RestartVatMethod = typeof KernelControlMethod.restartVat;

export const restartVatHandler: CommandHandler<RestartVatMethod> = {
  method: KernelControlMethod.restartVat,
  schema: KernelCommandPayloadStructs.restartVat.schema.params,
  implementation: async (
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams[RestartVatMethod],
  ): Promise<Json> => {
    await kernel.restartVat(params.id);
    return null;
  },
};
