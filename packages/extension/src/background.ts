/* eslint-disable import/extensions,import/no-unassigned-import */
import './dev-console.mjs';
import './endoify.mjs';
/* eslint-enable import/extensions,import/no-unassigned-import */

import type { ExtensionMessage } from './shared';
import { Command, Reply, makeHandledCallback } from './shared';

// globalThis.kernel will exist due to dev-console.mjs
Object.defineProperties(globalThis.kernel, {
  sendMessage: {
    value: sendMessage,
  },
});

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

// With this we can click the extension action button to wake up the service worker.
chrome.action.onClicked.addListener(() => {
  sendMessage(Command.Ping, { name: 'Kernel' }).catch(console.error);
});

/**
 * Send a message to the offscreen document.
 * @param type - The message type.
 * @param data - The message data.
 * @param data.name - The name to include in the message.
 */
async function sendMessage(type: string, data: { name: string }) {
  await provideOffScreenDocument();

  await chrome.runtime.sendMessage({
    type,
    target: 'offscreen',
    data,
  });
}

/**
 * Create the offscreen document if it doesn't already exist.
 */
async function provideOffScreenDocument() {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
      justification: `Surely you won't object to our capabilities?`,
    });
  }
}

// Here we handle replies from the offscreen document
chrome.runtime.onMessage.addListener(makeHandledCallback(handleMessage));

/**
 * Receive a message from the offscreen document.
 * @param message - The message to handle.
 */
async function handleMessage(message: ExtensionMessage<Reply, null>) {
  if (message.target !== 'background') {
    return;
  }

  switch (message.type) {
    case Reply.Pong:
      console.log(Reply.Pong);
      await closeOffscreenDocument();
      break;
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.error(`Received unexpected message type: "${message.type}"`);
  }
}

/**
 * Close the offscreen document if it exists.
 */
async function closeOffscreenDocument() {
  if (!(await chrome.offscreen.hasDocument())) {
    return;
  }
  await chrome.offscreen.closeDocument();
}
