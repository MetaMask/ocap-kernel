import {
  Kernel,
  KernelCommandMethod,
  isKernelCommand,
  isKernelCommandReply,
} from '@ocap/kernel';
import type { KernelCommandReply, KernelCommand, VatId } from '@ocap/kernel';
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
    id: 'v0',
    worker: makeIframeVatWorker('v0', initializeMessageChannel),
  });

  /**
   * Reply to a command from the background script.
   *
   * @param commandReply - The reply to send.
   */
  const replyToBackground = async (
    commandReply: KernelCommandReply,
  ): Promise<void> => {
    await backgroundStream.write(commandReply);
  };

  const kernelWorker = makeKernelWorker();

  // Handle messages from the background service worker and the kernel SQLite worker.
  await Promise.all([
    (async () => {
      for await (const message of backgroundStream) {
        if (!isKernelCommand(message)) {
          console.error('Offscreen received unexpected message', message);
          continue;
        }

        await handleKernelCommand(message);
      }
    })(),
    kernelWorker.receiveMessages(),
  ]);

  /**
   * Handle a KernelCommand received from the background script.
   *
   * @param command - The command to handle.
   */
  async function handleKernelCommand(command: KernelCommand): Promise<void> {
    const { method, params } = command;
    switch (method) {
      case KernelCommandMethod.Ping:
        await replyToBackground({ method, params: 'pong' });
        break;
      case KernelCommandMethod.Evaluate:
        await handleVatTestCommand({ method, params });
        break;
      case KernelCommandMethod.CapTpCall:
        await handleVatTestCommand({ method, params });
        break;
      case KernelCommandMethod.KVGet:
        await kernelWorker.sendMessage({ method, params });
        break;
      case KernelCommandMethod.KVSet:
        await kernelWorker.sendMessage({ method, params });
        break;
      default:
        console.error(
          'Offscreen received unexpected kernel command',
          // @ts-expect-error Runtime does not respect "never".
          { method: method.valueOf(), params },
        );
    }
  }

  /**
   * Handle a command implemented by the test vat.
   *
   * @param command - The command to handle.
   */
  async function handleVatTestCommand(
    command: Extract<
      KernelCommand,
      | { method: typeof KernelCommandMethod.Evaluate }
      | { method: typeof KernelCommandMethod.CapTpCall }
    >,
  ): Promise<void> {
    const { method, params } = command;
    const vat = await iframeReadyP;
    switch (method) {
      case KernelCommandMethod.Evaluate:
        await replyToBackground({
          method,
          params: await evaluate(vat.id, params),
        });
        break;
      case KernelCommandMethod.CapTpCall:
        await replyToBackground({
          method,
          params: stringify(await vat.callCapTp(params)),
        });
        break;
      default:
        console.error(
          'Offscreen received unexpected vat command',
          // @ts-expect-error Runtime does not respect "never".
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          { method: method.valueOf(), params },
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
  async function evaluate(vatId: VatId, source: string): Promise<string> {
    try {
      const result = await kernel.sendMessage(vatId, {
        method: KernelCommandMethod.Evaluate,
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
    sendMessage: (message: KernelCommand) => Promise<void>;
    receiveMessages: () => Promise<void>;
  } {
    const worker = new Worker('kernel-worker.js', { type: 'module' });
    const workerStream = new PostMessageDuplexStream<
      KernelCommandReply,
      KernelCommand
    >(
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
      for await (const message of workerStream) {
        if (!isKernelCommandReply(message)) {
          console.error('kernel received unexpected message', message);
          return;
        }
        const { method, params } = message;
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
          result = params;
        }
        const reply = { method, params: result ?? null };
        if (!isKernelCommandReply(reply)) {
          // Internal error.
          console.error('Malformed command reply', reply);
          return;
        }
        await replyToBackground(reply);
      }
    };

    const sendMessage = async (message: KernelCommand): Promise<void> => {
      await workerStream.write(message);
    };

    return {
      sendMessage,
      receiveMessages,
    };
  }
}
