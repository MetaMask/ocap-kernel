/* eslint-disable import/extensions,import/no-unassigned-import */
import './dev-console.mjs';
import './endoify.mjs';
/* eslint-enable import/extensions,import/no-unassigned-import */

import type { ExtensionMessage } from './shared';
import { Command, makeHandledCallback } from './shared';

// globalThis.kernel will exist due to dev-console.mjs
Object.defineProperties(globalThis.kernel, {
  sendMessage: {
    value: sendMessage,
  },
  evaluate: {
    value: async (source: string) => sendMessage(Command.Evaluate, source),
  },
  ping: {
    value: async () => sendMessage(Command.Ping),
  },
});

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

// With this we can click the extension action button to wake up the service worker.
chrome.action.onClicked.addListener(() => {
  sendMessage(Command.Ping).catch(console.error);
});

/**
 * Send a message to the offscreen document.
 * @param type - The message type.
 * @param data - The message data.
 * @param data.name - The name to include in the message.
 */
async function sendMessage(type: string, data?: string) {
  await provideOffScreenDocument();

  await chrome.runtime.sendMessage({
    type,
    target: 'offscreen',
    data: data ?? null,
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

// Handle replies from the offscreen document
chrome.runtime.onMessage.addListener(
  makeHandledCallback(async (message: ExtensionMessage<Command, string>) => {
    if (message.target !== 'background') {
      console.warn(
        `Background received message with unexpected target: "${message.target}"`,
      );
      return;
    }

    switch (message.type) {
      case Command.Evaluate:
      case Command.Ping:
        console.log(message.data);
        await closeOffscreenDocument();
        break;
      default:
        console.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Background received unexpected message type: "${message.type}"`,
        );
    }
  }),
);

/**
 * Close the offscreen document if it exists.
 */
async function closeOffscreenDocument() {
  if (!(await chrome.offscreen.hasDocument())) {
    return;
  }
  await chrome.offscreen.closeDocument();
}
