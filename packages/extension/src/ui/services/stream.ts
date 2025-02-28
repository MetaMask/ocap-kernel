import { MessageResolver } from '@ocap/kernel';

import { logger } from './logger.js';
import type { KernelControlMethod } from '../../kernel-integration/handlers/index.js';
import type {
  KernelControlCommand,
  KernelControlReturnType,
} from '../../kernel-integration/messages.js';
import { establishKernelConnection } from '../../kernel-integration/ui-connections.js';

export type SendMessageFunction = <Method extends KernelControlMethod>(
  payload: Extract<KernelControlCommand['payload'], { method: Method }>,
) => Promise<KernelControlReturnType[Method]>;

/**
 * Setup the stream for sending and receiving messages.
 *
 * @returns A function for sending messages.
 */
export async function setupStream(): Promise<{
  sendMessage: SendMessageFunction;
}> {
  const kernelStream = await establishKernelConnection(logger);

  const resolver = new MessageResolver('kernel');

  const cleanup = (): void => {
    resolver.terminateAll(new Error('Stream disconnected'));
    // Explicitly _do not_ return the stream, as the connection will be
    // re-established when the panel is reloaded. If we return the stream,
    // the remote end will be closed and the connection irrevocably lost.
  };

  window.addEventListener('unload', cleanup);

  kernelStream
    .drain(async ({ id, payload }) => {
      resolver.handleResponse(id, payload.params);
    })
    .catch((error) => {
      logger.error('error draining kernel stream', error);
    })
    .finally(cleanup);

  const sendMessage: SendMessageFunction = async (payload) => {
    logger.log('sending message', payload);
    return resolver.createMessage(async (messageId) => {
      await kernelStream.write({
        id: messageId,
        payload,
      } as KernelControlCommand);
    });
  };

  return { sendMessage };
}
