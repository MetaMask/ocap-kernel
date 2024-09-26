import { Kernel } from '@ocap/kernel';
import { initializeMessageChannel } from '@ocap/streams';
import type { CommandReply } from '@ocap/utils';
import { CommandMethod, isCommand } from '@ocap/utils';

import { makeIframeVatWorker } from './makeIframeVatWorker.js';
import {
  ExtensionMessageTarget,
  isExtensionRuntimeMessage,
  makeHandledCallback,
} from './shared.js';

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
    makeHandledCallback(async (message: unknown) => {
      if (!isExtensionRuntimeMessage(message) || !isCommand(message.payload)) {
        console.error('Offscreen received unexpected message', message);
        return;
      }
      if (message.target !== ExtensionMessageTarget.Offscreen) {
        console.error(
          `Offscreen received message with unexpected target: "${message.target}"`,
        );
        return;
      }

      const vat = await iframeReadyP;

      const { payload } = message;

      switch (payload.method) {
        case CommandMethod.Evaluate:
          await replyToCommand(
            CommandMethod.Evaluate,
            await evaluate(vat.id, payload.params),
          );
          break;
        case CommandMethod.CapTpCall: {
          const result = await vat.callCapTp(payload.params);
          await replyToCommand(
            CommandMethod.CapTpCall,
            JSON.stringify(result, null, 2),
          );
          break;
        }
        case CommandMethod.CapTpInit:
          await vat.makeCapTp();
          await replyToCommand(
            CommandMethod.CapTpInit,
            '~~~ CapTP Initialized ~~~',
          );
          break;
        case CommandMethod.Ping:
          await replyToCommand(CommandMethod.Ping, 'pong');
          break;
        default:
          console.error(
            // @ts-expect-error The type of `payload` is `never`, but this could happen at runtime.
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `Offscreen received unexpected command method: "${payload.method}"`,
          );
      }
    }),
  );

  /**
   * Reply to a command from the background script.
   *
   * @param method - The command method.
   * @param params - The command parameters.
   */
  async function replyToCommand(
    method: CommandReply['method'],
    params?: CommandReply['params'],
  ): Promise<void> {
    await chrome.runtime.sendMessage({
      target: ExtensionMessageTarget.Background,
      payload: {
        method,
        params: params ?? null,
      },
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
        method: CommandMethod.Evaluate,
        params: source,
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
