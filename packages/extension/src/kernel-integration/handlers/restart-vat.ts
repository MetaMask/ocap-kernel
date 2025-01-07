import { assert } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { Kernel, KVStore } from '@ocap/kernel';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type RestartVatMethod = typeof KernelControlMethod.restartVat;

export const restartVatHandler: CommandHandler<RestartVatMethod> = {
  validate: (params: unknown): params is CommandParams[RestartVatMethod] => {
    try {
      assert(params, KernelCommandPayloadStructs.restartVat.schema.params);
      return true;
    } catch {
      return false;
    }
  },

  async execute(
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams[RestartVatMethod],
  ): Promise<Json> {
    await kernel.restartVat(params.id);
    return null;
  },
};
