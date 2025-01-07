import { assert } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { Kernel, KVStore } from '@ocap/kernel';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type TerminateVatMethod = typeof KernelControlMethod.terminateVat;

export const terminateVatHandler: CommandHandler<TerminateVatMethod> = {
  validate: (params: unknown): params is CommandParams[TerminateVatMethod] => {
    try {
      assert(params, KernelCommandPayloadStructs.terminateVat.schema.params);
      return true;
    } catch {
      return false;
    }
  },

  async execute(
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams[TerminateVatMethod],
  ): Promise<Json> {
    await kernel.terminateVat(params.id);
    return null;
  },
};
