import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type LaunchVatMethod = typeof KernelControlMethod.launchVat;

export const launchVatHandler: CommandHandler<LaunchVatMethod> = {
  method: KernelControlMethod.launchVat,
  schema: KernelCommandPayloadStructs.launchVat.schema.params,
  implementation: async (
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams[LaunchVatMethod],
  ): Promise<Json> => {
    await kernel.launchVat(params);
    return null;
  },
};
