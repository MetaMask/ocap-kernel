import { IframeManager } from './iframe-manager.js';
import type { ExtensionMessage } from './shared.js';
import { Command, makeHandledCallback } from './shared.js';

// Handle messages from the background service worker
chrome.runtime.onMessage.addListener(
  makeHandledCallback(async (message: ExtensionMessage<Command, string>) => {
    if (message.target !== 'offscreen') {
      console.warn(
        `Offscreen received message with unexpected target: "${message.target}"`,
      );
      return;
    }

    switch (message.type) {
      case Command.Evaluate:
        await reply(Command.Evaluate, await evaluate(message.data));
        break;
      case Command.Ping:
        await reply(Command.Ping, 'pong');
        break;
      default:
        console.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Offscreen received unexpected message type: "${message.type}"`,
        );
    }
  }),
);

// Hard-code a single iframe for now.
const IFRAME_ID = 'default';
const iframeManager = IframeManager.getInstance();
iframeManager.create(IFRAME_ID).catch((error) => {
  throw error;
});

/**
 * Reply to the background script.
 *
 * @param type - The message type.
 * @param data - The message data.
 */
async function reply(type: Command, data?: string): Promise<void> {
  await chrome.runtime.sendMessage({
    data: data ?? null,
    target: 'background',
    type,
  });
}

/**
 * Evaluate a string in the default iframe.
 *
 * @param source - The source string to evaluate.
 * @returns The result of the evaluation, or an error message.
 */
async function evaluate(source: string): Promise<string> {
  try {
    const result = await iframeManager.sendMessage(IFRAME_ID, {
      type: Command.Evaluate,
      data: source,
    });
    return String(result);
  } catch (error) {
    if (error instanceof Error) {
      return `Error: ${error.message}`;
    }
    return `Error: Unknown error during evaluation.`;
  }
}
