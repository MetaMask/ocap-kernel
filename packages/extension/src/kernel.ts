import { Kernel } from '@ocap/kernel';
import { initializeMessageChannel, makeMessagePortStreamPair, receiveMessagePort } from '@ocap/streams';
import type { CommandReply } from '@ocap/utils';
import { Command, CommandMethod } from '@ocap/utils';

import { makeIframeVatWorker } from './makeIframeVatWorker.js';
main().catch(console.error);

/**
 * The main function for the kernel script.
 */
async function main(): Promise<void> {
  console.debug('starting kernel');
  const port = await receiveMessagePort();
  console.debug('kernel connected');
  const streams = makeMessagePortStreamPair<Command, CommandReply>(port);  
  const kernel = new Kernel();
  console.debug('launching vat');
  const iframeReadyP = kernel.launchVat({
    id: 'default',
    worker: makeIframeVatWorker('default', initializeMessageChannel),
  });
  let vatLaunchNotified: boolean = false;

  for await (const { method, params } of streams.reader) {
    console.debug('kernel received message', { method, params });

    const vat = await iframeReadyP;
    if (!vatLaunchNotified) {
      console.debug('vat connected');
      vatLaunchNotified = true;
    }

    switch (method) {
      case CommandMethod.Evaluate:
        await streams.writer.next({ method: CommandMethod.Evaluate, params: await evaluate(vat.id, params) });
        break;
      case CommandMethod.CapTpCall:
        const result = await vat.callCapTp(params);
        await streams.writer.next({ method: CommandMethod.CapTpCall, params: JSON.stringify(result, null, 2) });
        break;
      case CommandMethod.CapTpInit:
        await vat.makeCapTp();
        await streams.writer.next({ method: CommandMethod.CapTpInit, params: '~~~ CapTP Initialized ~~~'});
        break;
      case CommandMethod.Ping:
        await streams.writer.next({ method: CommandMethod.Ping, params: 'pong' });
        break;
      default:
        console.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Offscreen received unexpected command method: "${method}"`,
        );
    }
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
