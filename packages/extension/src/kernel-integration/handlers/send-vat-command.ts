import type { Json } from '@metamask/utils';
import { isKernelCommand } from '@ocap/kernel';
import type { Kernel, KVStore } from '@ocap/kernel';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type SendVatCommandMethod = typeof KernelControlMethod.sendVatCommand;

export const sendVatCommandHandler: CommandHandler<SendVatCommandMethod> = {
  method: KernelControlMethod.sendVatCommand,
  schema: KernelCommandPayloadStructs.sendVatCommand.schema.params,
  implementation: async (
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams[SendVatCommandMethod],
  ): Promise<Json> => {
    if (!isKernelCommand(params.payload)) {
      throw new Error('Invalid command payload');
    }

    if (!params.id) {
      throw new Error('Vat ID required for this command');
    }

    const result = await kernel.sendVatCommand(params.id, params.payload);
    return { result };
  },
};
