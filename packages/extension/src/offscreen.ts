// eslint-disable-next-line import/extensions,import/no-unassigned-import
import './apply-lockdown.mjs';

import type { ExtensionMessage } from './shared';
import { makeHandledCallback } from './shared';

chrome.runtime.onMessage.addListener(makeHandledCallback(handleMessage));

/**
 * Handle a message from the background script.
 * @param message - The message to handle.
 */
async function handleMessage(message: ExtensionMessage<{ name: string }>) {
  if (message.target !== 'offscreen') {
    return;
  }

  switch (message.type) {
    case 'greetings':
      await reply('salutations', `Good day to you, ${message.data.name}!`);
      break;
    default:
      console.error(`Received unexpected message type: "${message.type}"`);
  }
}

/**
 * Reply to the background script.
 * @param type - The message type.
 * @param data - The message data.
 */
async function reply(type: string, data: string) {
  await chrome.runtime.sendMessage({
    data,
    target: 'background',
    type,
  });
}
