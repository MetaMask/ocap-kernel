import { createWindow } from '@metamask/snaps-utils';
import { initializeMessageChannel } from '@ocap/streams';
import { VatManager, VatIframe } from '@ocap/kernel';

import type { ExtensionMessage } from './message.js';
import { Command, ExtensionMessageTarget } from './message.js';
import { makeHandledCallback } from './shared.js';

main().catch(console.error);

/**
 * The main function for the offscreen script.
 */
async function main(): Promise<void> {
  const kernel = new VatManager();

  const vatIframe = new VatIframe({ id: 'default' });
  const newWindow = await createWindow('iframe.html', vatIframe.iframeId);
  const port = await initializeMessageChannel(newWindow);
  await vatIframe.init(port);
  const iframeReadyP = await vatIframe.makeCapTp();

  kernel.addVat(vatIframe);

  // Handle messages from the background service worker
  chrome.runtime.onMessage.addListener(
    makeHandledCallback(async (message: ExtensionMessage) => {
      if (message.target !== ExtensionMessageTarget.Offscreen) {
        console.warn(
          `Offscreen received message with unexpected target: "${message.target}"`,
        );
        return;
      }

      await iframeReadyP;

      switch (message.type) {
        case Command.Evaluate:
          await reply(Command.Evaluate, await evaluate(message.data));
          break;
        case Command.CapTpCall: {
          const result = await vatIframe.callCapTp(message.data);
          await reply(Command.CapTpCall, JSON.stringify(result, null, 2));
          break;
        }
        case Command.CapTpInit:
          await vatIframe.makeCapTp();
          await reply(Command.CapTpInit, '~~~ CapTP Initialized ~~~');
          break;
        case Command.Ping:
          await reply(Command.Ping, 'pong');
          break;
        default:
          console.error(
            // @ts-expect-error The type of `message` is `never`, but this could happen at runtime.
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `Offscreen received unexpected message type: "${message.type}"`,
          );
      }
    }),
  );

  /**
   * Reply to the background script.
   *
   * @param type - The message type.
   * @param data - The message data.
   */
  async function reply(type: Command, data?: string): Promise<void> {
    await chrome.runtime.sendMessage({
      data: data ?? null,
      target: ExtensionMessageTarget.Background,
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
      const result = await kernel.sendMessage(vatIframe.id, {
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
}
