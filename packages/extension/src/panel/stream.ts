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
  // Connect to the offscreen script
  const port = chrome.runtime.connect({ name: 'popup' });

  // Create the stream
  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    KernelControlReply,
    KernelControlCommand
  >(chrome.runtime, ChromeRuntimeTarget.Popup, ChromeRuntimeTarget.Offscreen);

  // Cleanup stream on disconnect
  const cleanup = (): void => {
    offscreenStream.return().catch(logger.error);
  };
  port.onDisconnect.addListener(cleanup);
  window.addEventListener('unload', cleanup);

  // Send messages to the offscreen script
  const sendMessage = async (message: KernelControlCommand): Promise<void> => {
    logger.log('sending message', message);
    await offscreenStream.write(message);
  };

  // Handle messages from the offscreen script
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
        const { params } = message;

        // Handle error responses
        if (isErrorResponse(params)) {
          showOutput(stringify(params.error, 0), 'error');
          return;
        }

        // Handle successful responses
        showOutput(stringify(params, 2), 'info');
      }
    })
    .catch((error) => {
      logger.error('error draining offscreen stream', error);
    });

  return sendMessage;
}

type ErrorResponse = {
  error: unknown;
};

/**
 * Checks if a value is an error response.
 *
 * @param value - The value to check.
 * @returns Whether the value is an error response.
 */
function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === 'object' && value !== null && 'error' in value;
}
