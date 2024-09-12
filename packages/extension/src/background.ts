import type { Json } from '@metamask/utils';

import './background-trusted-prelude.js';
import type { ExtensionMessage } from './message.js';
import { Command, ExtensionTarget } from './message.js';
import { makeHandledCallback } from './shared.js';

// globalThis.kernel will exist due to dev-console.js in background-trusted-prelude.js
Object.defineProperties(globalThis.kernel, {
  capTpCall: {
    value: async (method: string, params: Json[]) =>
      sendMessage(Command.CapTpCall, { method, params }),
  },
  capTpInit: {
    value: async () => sendMessage(Command.CapTpInit),
  },
  evaluate: {
    value: async (source: string) => sendMessage(Command.Evaluate, source),
  },
  ping: {
    value: async () => sendMessage(Command.Ping),
  },
  sendMessage: {
    value: sendMessage,
  },
});
harden(globalThis.kernel);

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

// With this we can click the extension action button to wake up the service worker.
chrome.action.onClicked.addListener(() => {
  sendMessage(Command.Ping).catch(console.error);
});

/**
 * Send a message to the offscreen document.
 *
 * @param type - The message type.
 * @param data - The message data.
 * @param data.name - The name to include in the message.
 */
async function sendMessage(type: string, data?: Json): Promise<void> {
  await provideOffScreenDocument();

  await chrome.runtime.sendMessage({
    type,
    target: ExtensionTarget.Offscreen,
    data: data ?? null,
  });
}

/**
 * Create the offscreen document if it doesn't already exist.
 */
async function provideOffScreenDocument(): Promise<void> {
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
  makeHandledCallback(async (message: ExtensionMessage) => {
    if (message.target !== ExtensionTarget.Background) {
      console.warn(
        `Background received message with unexpected target: "${message.target}"`,
      );
      return;
    }

    switch (message.type) {
      case Command.Evaluate:
      case Command.CapTpCall:
      case Command.CapTpInit:
      case Command.Ping:
        console.log(message.data);
        break;
      default:
        console.error(
          // @ts-expect-error Exhaustiveness check
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Background received unexpected message type: "${message.type}"`,
        );
    }
  }),
);
