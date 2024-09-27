import { Kernel, CommandMethod, isCommand } from '@ocap/kernel';
import type {
  CommandReply,
  Command,
  CommandReplyFunction,
} from '@ocap/kernel';
import { initializeMessageChannel } from '@ocap/streams';

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
    await chrome.runtime.sendMessage({
      target: ExtensionMessageTarget.Background,
      payload: {
        method,
        params: params ?? null,
      },
    });
  };

  const receiveFromKernel = async (event: MessageEvent): Promise<void> => {
    // For the time being, the only messages that come from the kernel worker are replies to actions
    // initiated from the console, so just forward these replies to the console.  This will need to
    // change once this offscreen script is providing services to the kernel worker that don't
    // involve the user (e.g., for things the worker can't do for itself, such as create an
    // offscreen iframe).

    // XXX TODO: Using the IframeMessage type here assumes that the set of response messages is the
    // same as (and aligns perfectly with) the set of command messages, which is horribly, terribly,
    // awfully wrong.  Need to add types to account for the replies.
    if (!isCommand(event.data)) {
      console.error('kernel received unexpected message', event.data);
    }
    const { method, params } = event.data;
    let result: string;
    const possibleError = params as unknown as Error;
    if (possibleError?.message && possibleError?.stack) {
      // XXX TODO: The following is an egregious hack which is barely good enough for manual testing
      // but not acceptable for serious use.  We should be passing some kind of proper error
      // indication back so that the recipient will experience a thrown exception or rejected
      // promise, instead of having to look for a magic string.  This is tolerable only so long as
      // the sole eventual recipient is a human eyeball, and even then it's questionable.
      result = `ERROR: ${possibleError.message}`;
    } else {
      result = params as string;
    }
    await replyToCommand(method, result);
  };

  const kernelWorker = new Worker('kernel-worker.js', { type: 'module' });
  kernelWorker.addEventListener(
    'message',
    makeHandledCallback(receiveFromKernel),
  );

  // Handle messages from the background service worker, which for the time being stands in for the
  // user console.
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
        case CommandMethod.KVGet:
        case CommandMethod.KVSet:
          sendKernelMessage(payload);
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
   * Send a message to the kernel worker.
   *
   * @param payload - The message to send.
   */
  function sendKernelMessage(payload: Command): void {
    kernelWorker.postMessage(payload);
  }
}
