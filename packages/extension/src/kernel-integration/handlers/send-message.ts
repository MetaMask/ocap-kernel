import { assert } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { isKernelCommand, KernelSendMessageStruct } from '@ocap/kernel';
import type { Kernel, KVStore } from '@ocap/kernel';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type SendMessageMethod = typeof KernelControlMethod.sendMessage;

export const sendMessageHandler: CommandHandler<SendMessageMethod> = {
  method: KernelControlMethod.sendMessage,
  schema: KernelCommandPayloadStructs.sendMessage.schema.params,
  implementation: async (
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams[SendMessageMethod],
  ): Promise<Json> => {
    if (!isKernelCommand(params.payload)) {
      throw new Error('Invalid command payload');
    }

    if (!params.id) {
      throw new Error('Vat ID required for this command');
    }

    assert(params, KernelSendMessageStruct);
    const result = await kernel.sendMessage(params.id, params.payload);
    return { result };
  },
};
