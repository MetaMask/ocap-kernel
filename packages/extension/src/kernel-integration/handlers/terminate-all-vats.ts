import { assert } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type TerminateAllVatsMethod = typeof KernelControlMethod.terminateAllVats;

export const terminateAllVatsHandler: CommandHandler<TerminateAllVatsMethod> = {
  validate: (
    params: unknown,
  ): params is CommandParams[TerminateAllVatsMethod] => {
    try {
      assert(
        params,
        KernelCommandPayloadStructs.terminateAllVats.schema.params,
      );
      return true;
    } catch {
      return false;
    }
  },

  async execute(kernel: Kernel): Promise<Json> {
    await kernel.terminateAllVats();
    return null;
  },
};
