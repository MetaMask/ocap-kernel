import { Kernel } from '@ocap/kernel';
import { initializeMessageChannel } from '@ocap/streams';
import { Command, KernelMessageTarget, type KernelMessage } from '@ocap/utils';

import { makeIframeVatWorker } from './makeIframeVatWorker.js';
import { makeHandledCallback } from './shared.js';

main().catch(console.error);

/**
 * The main function for the offscreen script.
 */
async function main(): Promise<void> {
  const kernel = new Kernel();
  const iframeReadyP = kernel.launchVat({
    id: 'default',
    worker: makeIframeVatWorker('default', initializeMessageChannel),
  });

  // Handle messages from the background service worker
  chrome.runtime.onMessage.addListener(
    makeHandledCallback(async (message: KernelMessage) => {
      if (message.target !== KernelMessageTarget.Offscreen) {
        console.warn(
          `Offscreen received message with unexpected target: "${message.target}"`,
        );
        return;
      }

      const vat = await iframeReadyP;

      switch (message.type) {
        case Command.Evaluate:
          await reply(Command.Evaluate, await evaluate(vat.id, message.data));
          break;
        case Command.CapTpCall: {
          const result = await vat.callCapTp(message.data);
          await reply(Command.CapTpCall, JSON.stringify(result, null, 2));
          break;
        }
        case Command.CapTpInit:
          await vat.makeCapTp();
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
      target: KernelMessageTarget.Background,
      type,
    });
  }

  /**
   * Evaluate a string in the default iframe.
   *
   * @param vatId - The ID of the vat to send the message to.
   * @param source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  async function evaluate(vatId: string, source: string): Promise<string> {
    try {
      const result = await kernel.sendMessage(vatId, {
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
