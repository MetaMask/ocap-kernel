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
  schema: KernelCommandPayloadStructs.sendMessage.schema.params,

  async execute(
    kernel: Kernel,
    _kvStore: KVStore,
    params: CommandParams[SendMessageMethod],
  ): Promise<Json> {
    if (!isKernelCommand(params.payload)) {
      throw new Error('Invalid command payload');
    }

    if (params.payload.method === 'kvGet') {
      const result = kernel.kvGet(params.payload.params);
      if (!result) {
        throw new Error('Key not found');
      }
      return { result };
    }

    if (params.payload.method === 'kvSet') {
      const { key, value } = params.payload.params as {
        key: string;
        value: string;
      };
      kernel.kvSet(key, value);
      return params.payload.params;
    }

    if (!params.id) {
      throw new Error('Vat ID required for this command');
    }

    assert(params, KernelSendMessageStruct);
    const result = await kernel.sendMessage(params.id, params.payload);
    return { result };
  },
};
