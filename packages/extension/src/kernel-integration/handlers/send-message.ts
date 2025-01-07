import type { Infer } from '@metamask/superstruct';
import { assert } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import {
  isKernelCommand,
  isVatId,
  KernelSendMessageStruct,
} from '@ocap/kernel';
import type { Kernel, KVStore } from '@ocap/kernel';

import type { KernelCommandPayloadStructs } from '../messages.js';

type SendMessageParams = Infer<
  typeof KernelCommandPayloadStructs.sendMessage
>['params'];

export const sendMessageHandler = {
  validate: (params: unknown): params is SendMessageParams => {
    return (
      typeof params === 'object' &&
      params !== null &&
      'payload' in params &&
      isKernelCommand(params.payload) &&
      ('id' in params ? isVatId(params.id) : true)
    );
  },

  async execute(
    kernel: Kernel,
    _kvStore: KVStore,
    params: SendMessageParams,
  ): Promise<Json> {
    const { payload, id } = params;

    if (payload.method === 'kvGet') {
      const result = kernel.kvGet(payload.params);
      if (!result) {
        throw new Error('Key not found');
      }
      return { result };
    }

    if (payload.method === 'kvSet') {
      const { key, value } = payload.params as { key: string; value: string };
      kernel.kvSet(key, value);
      return payload.params;
    }

    if (!id) {
      throw new Error('Vat ID required for this command');
    }

    assert(params, KernelSendMessageStruct);
    const result = await kernel.sendMessage(id, payload);
    return { result };
  },
};
