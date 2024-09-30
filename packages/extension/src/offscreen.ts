import {
  Kernel,
  KernelCommandMethod,
  isKernelCommand,
  isKernelCommandReply,
} from '@ocap/kernel';
import type {
  KernelCommandReply,
  KernelCommand,
  KernelCommandReplyFunction,
  VatId,
} from '@ocap/kernel';
import {
  ChromeRuntimeTarget,
  initializeMessageChannel,
  makeChromeRuntimeStreamPair,
} from '@ocap/streams';
import { stringify } from '@ocap/utils';

import { makeIframeVatWorker } from './iframe-vat-worker.js';
import { makeHandledCallback } from './shared.js';

main().catch(console.error);

/**
 * The main function for the offscreen script.
 */
async function main(): Promise<void> {
  const backgroundStreams = makeChromeRuntimeStreamPair(
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
   * @param method - The command method.
   * @param params - The command parameters.
   */
  const replyToBackground: KernelCommandReplyFunction<Promise<void>> = async (
    method: KernelCommand['method'],
    params?: KernelCommandReply['params'],
  ) => {
    await backgroundStreams.writer.next({
      method,
      params: params ?? null,
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
    if (!isKernelCommandReply(event.data)) {
      console.error('kernel received unexpected message', event.data);
      return;
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
      result = params;
    }
    // @ts-expect-error TODO: resolve method types.
    await replyToBackground(method, result);
  };

  const kernelWorker = new Worker('kernel-worker.js', { type: 'module' });
  kernelWorker.addEventListener(
    'message',
    makeHandledCallback(receiveFromKernel),
  );

  const handleVatTestCommand = async ({
    method,
    params,
  }: Extract<
    KernelCommand,
    | { method: typeof KernelCommandMethod.Evaluate }
    | { method: typeof KernelCommandMethod.CapTpCall }
  >): Promise<void> => {
    const vat = await iframeReadyP;
    switch (method) {
      case KernelCommandMethod.Evaluate:
        await replyToBackground(method, await evaluate(vat.id, params));
        break;
      case KernelCommandMethod.CapTpCall:
        await replyToBackground(method, stringify(await vat.callCapTp(params)));
        break;
      default:
        console.error(
          'Offscreen received unexpected vat command',
          // @ts-expect-error Runtime does not respect "never".
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          { method: method.valueOf(), params },
        );
    }
  };

  const handleKernelCommand = async ({
    method,
    params,
  }: KernelCommand): Promise<void> => {
    switch (method) {
      case KernelCommandMethod.Ping:
        await replyToBackground(method, 'pong');
        break;
      case KernelCommandMethod.Evaluate:
        await handleVatTestCommand({ method, params });
        break;
      case KernelCommandMethod.CapTpCall:
        await handleVatTestCommand({ method, params });
        break;
      case KernelCommandMethod.KVGet:
        sendKernelMessage({ method, params });
        break;
      case KernelCommandMethod.KVSet:
        sendKernelMessage({ method, params });
        break;
      default:
        console.error(
          'Offscreen received unexpected kernel command',
          // @ts-expect-error Runtime does not respect "never".
          { method: method.valueOf(), params },
        );
    }
  };

  // Handle messages from the background service worker, which for the time being stands in for the
  // user console.
  for await (const message of backgroundStreams.reader) {
    if (!isKernelCommand(message)) {
      console.error('Offscreen received unexpected message', message);
      continue;
    }

    await handleKernelCommand(message);
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
   * Send a message to the kernel worker.
   *
   * @param payload - The message to send.
   */
  function sendKernelMessage(payload: KernelCommand): void {
    kernelWorker.postMessage(payload);
  }
}
