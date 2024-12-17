import { assert } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import {
  Kernel,
  isKernelCommand,
  KernelSendMessageStruct,
  isVatId,
  isVatConfig,
} from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';

import type { KernelControlReply, KernelControlCommand } from './messages.js';
import { KernelControlMethod } from './messages.js';

const logger = makeLogger('[kernel panel messages]');

/**
 * Handles a message from the panel.
 *
 * @param kernel - The kernel instance.
 * @param message - The message to handle.
 * @returns The reply to the message.
 */
export async function handlePanelMessage(
  kernel: Kernel,
  message: KernelControlCommand,
): Promise<KernelControlReply> {
  const { method, params } = message.payload;
  try {
    switch (method) {
      case KernelControlMethod.launchVat: {
        if (!isVatConfig(params)) {
          throw new Error('Valid vat config required');
        }
        await kernel.launchVat(params);
        return {
          id: message.id,
          payload: {
            method: KernelControlMethod.launchVat,
            params: null,
          },
        };
      }

      case KernelControlMethod.restartVat: {
        if (!isVatId(params.id)) {
          throw new Error('Valid vat id required');
        }
        await kernel.restartVat(params.id);
        return {
          id: message.id,
          payload: {
            method: KernelControlMethod.restartVat,
            params: null,
          },
        };
      }

      case KernelControlMethod.terminateVat: {
        if (!isVatId(params.id)) {
          throw new Error('Valid vat id required');
        }
        await kernel.terminateVat(params.id);
        return {
          id: message.id,
          payload: {
            method: KernelControlMethod.terminateVat,
            params: null,
          },
        };
      }

      case KernelControlMethod.terminateAllVats: {
        await kernel.terminateAllVats();
        return {
          id: message.id,
          payload: {
            method: KernelControlMethod.terminateAllVats,
            params: null,
          },
        };
      }

      case KernelControlMethod.getStatus: {
        return {
          id: message.id,
          payload: {
            method: KernelControlMethod.getStatus,
            params: {
              vats: kernel.getVats(),
            },
          },
        };
      }

      case KernelControlMethod.clearState: {
        await kernel.reset();
        return {
          id: message.id,
          payload: {
            method: KernelControlMethod.clearState,
            params: null,
          },
        };
      }

      case KernelControlMethod.sendMessage: {
        if (!isKernelCommand(params.payload)) {
          throw new Error('Invalid command payload');
        }

        if (params.payload.method === 'kvGet') {
          const result = kernel.kvGet(params.payload.params);
          if (!result) {
            throw new Error('Key not found');
          }
          return {
            id: message.id,
            payload: {
              method: KernelControlMethod.sendMessage,
              params: { result } as Json,
            },
          };
        }

        if (params.payload.method === 'kvSet') {
          kernel.kvSet(params.payload.params.key, params.payload.params.value);
          return {
            id: message.id,
            payload: {
              method: KernelControlMethod.sendMessage,
              params: params.payload.params,
            },
          };
        }

        if (!isVatId(params.id)) {
          throw new Error('Vat ID required for this command');
        }

        assert(params, KernelSendMessageStruct);

        const result = await kernel.sendMessage(params.id, params.payload);

        return {
          id: message.id,
          payload: {
            method: KernelControlMethod.sendMessage,
            params: { result } as Json,
          },
        };
      }

      default: {
        throw new Error('Unknown method');
      }
    }
  } catch (error) {
    logger.error('Error handling message:', error);
    return {
      id: message.id,
      payload: {
        method,
        params: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
    } as KernelControlReply;
  }
}
