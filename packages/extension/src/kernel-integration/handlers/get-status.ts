import { assert } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type GetStatusMethod = typeof KernelControlMethod.getStatus;

export const getStatusHandler: CommandHandler<GetStatusMethod> = {
  validate: (params: unknown): params is CommandParams[GetStatusMethod] => {
    try {
      assert(params, KernelCommandPayloadStructs.getStatus.schema.params);
      return true;
    } catch {
      return false;
    }
  },

  async execute(kernel: Kernel): Promise<Json> {
    return {
      vats: kernel.getVats(),
    };
  },
};
