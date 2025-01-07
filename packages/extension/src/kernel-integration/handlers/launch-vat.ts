import type { Json } from '@metamask/utils';
import type { Kernel, KVStore } from '@ocap/kernel';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type LaunchVatMethod = typeof KernelControlMethod.launchVat;

export const launchVatHandler: CommandHandler<LaunchVatMethod> = {
  schema: KernelCommandPayloadStructs.launchVat.schema.params,

  async execute(
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams[LaunchVatMethod],
  ): Promise<Json> {
    await kernel.launchVat(params);
    return null;
  },
};
