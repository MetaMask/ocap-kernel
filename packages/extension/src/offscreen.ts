// eslint-disable-next-line import/extensions,import/no-unassigned-import
import './endoify.mjs';

import type { ExtensionMessage } from './shared';
import { Command, Reply, makeHandledCallback } from './shared';

chrome.runtime.onMessage.addListener(makeHandledCallback(handleMessage));

/**
 * Handle a message from the background script.
 * @param message - The message to handle.
 */
async function handleMessage(
  message: ExtensionMessage<Command, { name: string }>,
) {
  if (message.target !== 'offscreen') {
    return;
  }

  switch (message.type) {
    case Command.Ping:
      await reply(Reply.Pong);
      break;
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.error(`Received unexpected message type: "${message.type}"`);
  }
}

/**
 * Reply to the background script.
 * @param type - The message type.
 * @param data - The message data.
 */
async function reply(type: string, data?: string) {
  await chrome.runtime.sendMessage({
    data: data ?? null,
    target: 'background',
    type,
  });
}
