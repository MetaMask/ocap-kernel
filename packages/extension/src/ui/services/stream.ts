import { MessageResolver } from '@ocap/kernel';
import { ChromeRuntimeDuplexStream, ChromeRuntimeTarget } from '@ocap/streams';

import { logger } from './logger.js';
import { isKernelControlReply } from '../../kernel-integration/messages.js';
import type {
  KernelControlCommand,
  KernelControlMethod,
  KernelControlReply,
  KernelControlReturnType,
} from '../../kernel-integration/messages.js';

export type SendMessageFunction = <
  Method extends keyof typeof KernelControlMethod,
>(
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
  const port = chrome.runtime.connect({ name: 'popup' });

  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    KernelControlReply,
    KernelControlCommand
  >(
    chrome.runtime,
    ChromeRuntimeTarget.Popup,
    ChromeRuntimeTarget.Offscreen,
    isKernelControlReply,
  );

  const resolver = new MessageResolver('kernel');

  const cleanup = (): void => {
    resolver.terminateAll(new Error('Stream disconnected'));
    offscreenStream.return().catch((error) => {
      logger.error('error returning offscreen stream', error);
    });
  };

  port.onDisconnect.addListener(cleanup);
  window.addEventListener('unload', cleanup);

  offscreenStream
    .drain(async ({ id, payload }) => {
      resolver.handleResponse(id, payload.params);
    })
    .catch((error) => {
      logger.error('error draining offscreen stream', error);
    });

  const sendMessage: SendMessageFunction = async (payload) => {
    logger.log('sending message', payload);
    return resolver.createMessage(async (messageId) => {
      await offscreenStream.write({
        id: messageId,
        payload,
      } as KernelControlCommand);
    });
  };

  return { sendMessage };
}
