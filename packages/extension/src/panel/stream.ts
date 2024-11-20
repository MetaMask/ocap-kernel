import { ChromeRuntimeDuplexStream, ChromeRuntimeTarget } from '@ocap/streams';

import { handleKernelMessage } from './messages.js';
import { logger } from './shared.js';
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
  offscreenStream.drain(handleKernelMessage).catch((error) => {
    logger.error('error draining offscreen stream', error);
  });

  return sendMessage;
}
