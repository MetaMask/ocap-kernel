import type { Json } from '@metamask/utils';
import type { Kernel, KVStore } from '@ocap/kernel';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type ResetVatMethod = typeof KernelControlMethod.resetVat;

export const resetVatHandler: CommandHandler<ResetVatMethod> = {
  method: KernelControlMethod.resetVat,
  schema: KernelCommandPayloadStructs.terminateVat.schema.params,
  implementation: async (
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams[ResetVatMethod],
  ): Promise<Json> => {
    await kernel.resetVat(params.id);
    return null;
  },
};
