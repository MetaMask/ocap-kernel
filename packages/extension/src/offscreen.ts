import { Kernel } from '@ocap/kernel';
import { initializeMessageChannel } from '@ocap/streams';
import type { CommandReply } from '@ocap/utils';
import { CommandMethod } from '@ocap/utils';

import { makeOffscreenBackgroundStreamPair } from './extension-stream-pairs.js';
import { makeIframeVatWorker } from './makeIframeVatWorker.js';

const streams = makeOffscreenBackgroundStreamPair();

main().catch(console.error);

/**
 * The main function for the offscreen script.
 */
async function main(): Promise<void> {
  const kernel = new Kernel();
  const vat = await kernel.launchVat({
    id: 'default',
    worker: makeIframeVatWorker('default', initializeMessageChannel),
  });

  for await (const { method, params } of streams.reader) {
    switch (method) {
      case CommandMethod.Evaluate:
        await reply({
          method: CommandMethod.Evaluate,
          params: await evaluate(vat.id, params),
        });
        break;
      case CommandMethod.CapTpCall: {
        const result = await vat.callCapTp(params);
        await reply({
          method: CommandMethod.CapTpCall,
          params: JSON.stringify(result, null, 2),
        });
        break;
      }
      case CommandMethod.CapTpInit:
        await vat.makeCapTp();
        await reply({
          method: CommandMethod.CapTpInit,
          params: '~~~ CapTP Initialized ~~~',
        });
        break;
      case CommandMethod.Ping:
        await reply({ method: CommandMethod.Ping, params: 'pong' });
        break;
      default:
        console.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Offscreen received unexpected command method: "${method}"`,
        );
    }
  }

  /**
   * Reply to a command from the background script.
   *
   * @param commandReply - The reply to the command.
   * @param commandReply.type - The command type.
   * @param commandReply.params - The reply's params.
   */
  async function reply(commandReply: CommandReply): Promise<void> {
    await streams.writer.next(commandReply);
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
