import type { Json } from '@metamask/utils';
import { isKernelCommand } from '@ocap/kernel';
import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import { KernelCommandPayloadStructs } from '../messages.js';

export const sendVatCommandHandler: CommandHandler<'sendVatCommand'> = {
  method: 'sendVatCommand',
  schema: KernelCommandPayloadStructs.sendVatCommand.schema.params,
  implementation: async (
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams['sendVatCommand'],
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
