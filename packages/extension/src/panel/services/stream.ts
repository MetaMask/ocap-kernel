import { ChromeRuntimeDuplexStream, ChromeRuntimeTarget } from '@ocap/streams';

import { logger } from './logger.js';
import { isKernelControlReply } from '../../kernel-integration/messages.js';
import type {
  KernelControlCommand,
  KernelControlReply,
} from '../../kernel-integration/messages.js';

/**
 * Setup the stream for sending and receiving messages.
 *
 * @param handleKernelMessage - Callback to handle incoming messages
 * @returns A function for sending messages.
 */
export async function setupStream(
  handleKernelMessage: (message: KernelControlReply) => void,
): Promise<{
  offscreenStream: ChromeRuntimeDuplexStream<
    KernelControlReply,
    KernelControlCommand
  >;
  sendMessage: (message: KernelControlCommand) => Promise<void>;
}> {
  // Connect to the offscreen script
  const port = chrome.runtime.connect({ name: 'popup' });

  // Create the stream
  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    KernelControlReply,
    KernelControlCommand
  >(
    chrome.runtime,
    ChromeRuntimeTarget.Popup,
    ChromeRuntimeTarget.Offscreen,
    isKernelControlReply,
  );

  // Cleanup stream on disconnect
  const cleanup = (): void => {
    offscreenStream.return().catch((error) => {
      logger.error('error returning offscreen stream', error);
    });
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

  return { offscreenStream, sendMessage };
}
