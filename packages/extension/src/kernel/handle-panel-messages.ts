import type { Json } from '@metamask/utils';
import { Kernel, isVatId, isKernelCommand } from '@ocap/kernel';
import type { VatCommand } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';

import { isKernelControlCommand } from './messages.js';
import type { KernelControlReply, KernelControlCommand } from './messages.js';

const logger = makeLogger('[kernel panel messages]');
/**
 * Handle messages from the Kernel Panel.
 *
 * @param kernel - The kernel instance.
 */
export function handlePanelMessages(kernel: Kernel): void {
  // Handle Kernel Panel messages
  // TODO: This is a temporary solution to allow the kernel worker to send replies back to the
  // offscreen script. This should be replaced with MultiplexStream once it's implemented.
  globalThis.addEventListener('message', (event) => {
    if (isKernelControlCommand(event.data)) {
      handleMessage(kernel, event.data)
        .then((reply) => globalThis.postMessage(reply))
        .catch(logger.error);
    }
  });
}

/**
 * Handle a control message and return the appropriate reply.
 *
 * @param kernel - The kernel instance.
 * @param message - The control message to handle.
 * @returns The reply to the control message.
 */
async function handleMessage(
  kernel: Kernel,
  message: KernelControlCommand,
): Promise<KernelControlReply> {
  switch (message.method) {
    case 'launchVat':
      await kernel.launchVat({ id: message.params.id });
      return { method: 'launchVat', params: null };

    case 'restartVat':
      await kernel.restartVat(message.params.id);
      return { method: 'restartVat', params: null };

    case 'terminateVat':
      await kernel.terminateVat(message.params.id);
      return { method: 'terminateVat', params: null };

    case 'terminateAllVats':
      await kernel.terminateAllVats();
      return { method: 'terminateAllVats', params: null };

    case 'getStatus':
      return {
        method: 'getStatus',
        params: {
          isRunning: true, // TODO: Track actual kernel state
          activeVats: kernel.getVatIds(),
        },
      };

    case 'sendMessage':
      try {
        if (
          isVatId(message.params.id) &&
          !['kVGet', 'kVSet'].includes(message.params.payload.method)
        ) {
          const result = await kernel.sendMessage(
            message.params.id,
            message.params.payload as VatCommand['payload'],
          );
          return { method: 'sendMessage', params: { result } as Json };
        }

        if (isKernelCommand(message.params.payload)) {
          if (message.params.payload.method === 'kVGet') {
            const result = kernel.kvGet(message.params.payload.params);
            if (!result) {
              throw new Error('Key not found');
            }
            return {
              method: 'sendMessage',
              params: { key: message.params.payload.params, result } as Json,
            };
          } else if (message.params.payload.method === 'kVSet') {
            kernel.kvSet(
              message.params.payload.params.key,
              message.params.payload.params.value,
            );
            return {
              method: 'sendMessage',
              params: message.params.payload.params,
            };
          }
        }

        if (['ping', 'evaluate'].includes(message.params.payload.method)) {
          throw new Error('Specify Vat ID to send this command');
        }

        throw new Error('Unknown command');
      } catch (error) {
        return {
          method: 'sendMessage',
          params: {
            error: error instanceof Error ? error.message : error,
          } as Json,
        };
      }

    default:
      logger.error('Unknown control message method', message);
      throw new Error(`Unknown control message: ${JSON.stringify(message)}`);
  }
}
