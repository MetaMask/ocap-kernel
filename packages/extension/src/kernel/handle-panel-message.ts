import type { Json } from '@metamask/utils';
import { Kernel, isVatId, isKernelCommand, isVatCommand } from '@ocap/kernel';
import { makeLogger, stringify } from '@ocap/utils';

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
  try {
    switch (message.method) {
      case KernelControlMethod.launchVat: {
        await kernel.launchVat({ id: message.params.id });
        return { method: KernelControlMethod.launchVat, params: null };
      }

      case KernelControlMethod.restartVat: {
        await kernel.restartVat(message.params.id);
        return { method: KernelControlMethod.restartVat, params: null };
      }

      case KernelControlMethod.terminateVat: {
        await kernel.terminateVat(message.params.id);
        return { method: KernelControlMethod.terminateVat, params: null };
      }

      case KernelControlMethod.terminateAllVats: {
        await kernel.terminateAllVats();
        return { method: KernelControlMethod.terminateAllVats, params: null };
      }

      case KernelControlMethod.getStatus: {
        return {
          method: KernelControlMethod.getStatus,
          params: {
            isRunning: true, // TODO: Track actual kernel state
            activeVats: kernel.getVatIds(),
          },
        };
      }

      case KernelControlMethod.sendMessage: {
        if (!isKernelCommand(message.params.payload)) {
          throw new Error('Invalid command payload');
        }

        if (message.params.payload.method === 'kvGet') {
          const result = kernel.kvGet(message.params.payload.params);
          if (!result) {
            throw new Error('Key not found');
          }
          return {
            method: KernelControlMethod.sendMessage,
            params: { result } as Json,
          };
        }

        if (message.params.payload.method === 'kvSet') {
          kernel.kvSet(
            message.params.payload.params.key,
            message.params.payload.params.value,
          );
          return {
            method: KernelControlMethod.sendMessage,
            params: message.params.payload.params,
          };
        }

        if (!isVatId(message.params.id)) {
          throw new Error('Vat ID required for this command');
        }

        if (!isVatCommand(message.params)) {
          throw new Error(`Invalid vat command: ${stringify(message.params)}`);
        }

        const result = await kernel.sendMessage(
          message.params.id,
          message.params.payload,
        );

        return {
          method: KernelControlMethod.sendMessage,
          params: { result } as Json,
        };
      }

      default: {
        throw new Error('Unknown method');
      }
    }
  } catch (error) {
    logger.error('Error handling message:', error);
    return {
      method: KernelControlMethod.sendMessage,
      params: {
        error: error instanceof Error ? error.message : String(error),
      } as Json,
    };
  }
}
