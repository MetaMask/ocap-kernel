import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type ClearStateMethod = typeof KernelControlMethod.clearState;

export const clearStateHandler: CommandHandler<ClearStateMethod> = {
  schema: KernelCommandPayloadStructs.clearState.schema.params,

  async execute(kernel: Kernel): Promise<Json> {
    await kernel.reset();
    return null;
  },
};
