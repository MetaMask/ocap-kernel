import { ChromeRuntimeDuplexStream, ChromeRuntimeTarget } from '@ocap/streams';
import { stringify } from '@ocap/utils';

import { showOutput } from './messages.js';
import { logger } from './shared.js';
import { updateStatusDisplay } from './status.js';
import { isKernelControlReply, isKernelStatus } from '../kernel/messages.js';
import type {
  KernelControlCommand,
  KernelControlReply,
} from '../kernel/messages.js';

/**
 * Setup the stream for sending and receiving messages.
 *
 * @returns A function for sending messages.
 */
export async function setupStream(): Promise<
  (message: KernelControlCommand) => Promise<void>
> {
  chrome.runtime.connect({ name: 'popup' });

  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    KernelControlReply,
    KernelControlCommand
  >(chrome.runtime, ChromeRuntimeTarget.Popup, ChromeRuntimeTarget.Offscreen);

  const sendMessage = async (message: KernelControlCommand): Promise<void> => {
    logger.log('sending message', message);
    await offscreenStream.write(message);
  };

  offscreenStream
    .drain((message) => {
      if (!isKernelControlReply(message) || message.params === null) {
        return;
      }

      if (isKernelStatus(message.params)) {
        updateStatusDisplay(message.params);
        return;
      }

      if (message.method === 'sendMessage') {
        if (typeof message.params === 'object' && 'error' in message.params) {
          showOutput(stringify(message.params.error, 0), 'error');
        } else {
          showOutput(stringify(message.params, 2), 'info');
        }
      }
    })
    .catch((error) => {
      logger.error('error draining offscreen stream', error);
    });

  return sendMessage;
}

/**
 * Setup status polling.
 *
 * @param sendMessage - A function for sending messages.
 */
export async function setupStatusPolling(
  sendMessage: (message: KernelControlCommand) => Promise<void>,
): Promise<void> {
  const fetchStatus = async (): Promise<void> => {
    await sendMessage({
      method: 'getStatus',
      params: null,
    });

    setTimeout(() => {
      fetchStatus().catch(logger.error);
    }, 1000);
  };

  await fetchStatus();
}
