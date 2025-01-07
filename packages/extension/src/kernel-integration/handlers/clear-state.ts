import { assert } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type ClearStateMethod = typeof KernelControlMethod.clearState;

export const clearStateHandler: CommandHandler<ClearStateMethod> = {
  validate: (params: unknown): params is CommandParams[ClearStateMethod] => {
    try {
      assert(params, KernelCommandPayloadStructs.clearState.schema.params);
      return true;
    } catch {
      return false;
    }
  },

  async execute(kernel: Kernel): Promise<Json> {
    await kernel.reset();
    return null;
  },
};
