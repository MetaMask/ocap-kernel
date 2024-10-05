import { Kernel, CommandMethod, isCommand, isCommandReply } from '@ocap/kernel';
import type { CommandReply, Command, CommandReplyFunction } from '@ocap/kernel';
import {
  ChromeRuntimeTarget,
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  PostMessageDuplexStream,
} from '@ocap/streams';
import { stringify } from '@ocap/utils';

import { makeIframeVatWorker } from './iframe-vat-worker.js';

main().catch(console.error);

/**
 * The main function for the offscreen script.
 */
async function main(): Promise<void> {
  const backgroundStream = new ChromeRuntimeDuplexStream(
    chrome.runtime,
    ChromeRuntimeTarget.Offscreen,
    ChromeRuntimeTarget.Background,
  );

  const kernel = new Kernel();
  const iframeReadyP = kernel.launchVat({
    id: 'default',
    worker: makeIframeVatWorker('default', initializeMessageChannel),
  });

  /**
   * Reply to a command from the background script.
   *
   * @param method - The command method.
   * @param params - The command parameters.
   */
  const replyToCommand: CommandReplyFunction<Promise<void>> = async (
    method: CommandMethod,
    params?: CommandReply['params'],
  ) => {
    await backgroundStream.write({
      method,
      params: params ?? null,
    });
  };

  const kernelWorker = makeKernelWorker();

  await Promise.all([
    kernelWorker.receiveMessages(),
    // Handle messages from the background service worker, which for the time being stands in for the
    // user console.
    (async () => {
      for await (const message of backgroundStream.reader) {
        if (!isCommand(message)) {
          console.error('Offscreen received unexpected message', message);
          continue;
        }

        const vat = await iframeReadyP;

        switch (message.method) {
          case CommandMethod.Evaluate:
            await replyToCommand(
              CommandMethod.Evaluate,
              await evaluate(vat.id, message.params),
            );
            break;
          case CommandMethod.CapTpCall: {
            const result = await vat.callCapTp(message.params);
            await replyToCommand(CommandMethod.CapTpCall, stringify(result));
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
          case CommandMethod.KVGet:
          case CommandMethod.KVSet:
            await kernelWorker.sendMessage(message);
            break;
          default:
            console.error(
              // @ts-expect-error Runtime does not respect "never".
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `Offscreen received unexpected command method: "${message.method}"`,
            );
        }
      }
    })(),
  ]);

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

  /**
   * Make the SQLite kernel worker.
   *
   * @returns An object with methods to send and receive messages from the kernel worker.
   */
  function makeKernelWorker(): {
    sendMessage: (message: Command) => Promise<void>;
    receiveMessages: () => Promise<void>;
  } {
    const worker = new Worker('kernel-worker.js', { type: 'module' });
    const streamPair = new PostMessageDuplexStream<CommandReply, Command>(
      (message) => worker.postMessage(message),
      (listener) => worker.addEventListener('message', listener),
      (listener) => worker.removeEventListener('message', listener),
    );

    const receiveMessages = async (): Promise<void> => {
      // For the time being, the only messages that come from the kernel worker are replies to actions
      // initiated from the console, so just forward these replies to the console.  This will need to
      // change once this offscreen script is providing services to the kernel worker that don't
      // involve the user (e.g., for things the worker can't do for itself, such as create an
      // offscreen iframe).

      // XXX TODO: Using the IframeMessage type here assumes that the set of response messages is the
      // same as (and aligns perfectly with) the set of command messages, which is horribly, terribly,
      // awfully wrong.  Need to add types to account for the replies.
      for await (const message of streamPair.reader) {
        if (!isCommandReply(message) || message.method === CommandMethod.Ping) {
          console.error('kernel received unexpected message', message);
          continue;
        }
        const { method, params } = message;
        let result: string;
        const possibleError = params as unknown as {
          message: string;
          stack: string;
        };
        if (possibleError?.message && possibleError?.stack) {
          // XXX TODO: The following is an egregious hack which is barely good enough for manual testing
          // but not acceptable for serious use.  We should be passing some kind of proper error
          // indication back so that the recipient will experience a thrown exception or rejected
          // promise, instead of having to look for a magic string.  This is tolerable only so long as
          // the sole eventual recipient is a human eyeball, and even then it's questionable.
          result = `ERROR: ${possibleError.message}`;
        } else {
          result = params;
        }
        await replyToCommand(method, result);
      }
    };

    const sendMessage = async (message: Command): Promise<void> => {
      await streamPair.writer.next(message);
    };

    return {
      sendMessage,
      receiveMessages,
    };
  }
}
