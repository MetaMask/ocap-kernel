import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type ReloadMethod = typeof KernelControlMethod.reload;

export const reloadConfigHandler: CommandHandler<ReloadMethod> = {
  method: KernelControlMethod.reload,
  schema: KernelCommandPayloadStructs.clearState.schema.params,
  implementation: async (kernel: Kernel): Promise<Json> => {
    await kernel.reload();
    return null;
  },
};
