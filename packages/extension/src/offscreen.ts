import { IframeManager } from './iframe-manager.js';
import type { ExtensionMessage, IframeMessage } from './message.js';
import { Command, DataObject, ExtensionMessageTarget } from './message.js';
import { makeHandledCallback } from './shared.js';

main().catch(console.error);

/**
 * The main function for the offscreen script.
 */
async function main(): Promise<void> {
  // Hard-code a single iframe for now.
  const IFRAME_ID = 'default';
  const iframeManager = new IframeManager();
  const iframeReadyP = iframeManager
    .create({ id: IFRAME_ID })
    .then(async () => iframeManager.makeCapTp(IFRAME_ID));

  const receiveFromKernel = async (event: MessageEvent) => {
    // For the time being, the only messages that come from the kernel worker are replies to actions
    // initiated from the console, so just forward these replies to the console.  This will need to
    // change once this offscreen script is providing services to the kernel worker that don't
    // involve the user (e.g., for things the worker can't do for itself, such as create an
    // offscreen iframe).

    // XXX TODO: Using the IframeMessage type here assumes that the set of response messages is the
    // same as (and aligns perfectly with) the set of command messages, which is horribly, terribly,
    // awfully wrong.  Need to add types to account for the replies.
    const message = event.data as IframeMessage;
    const { type, data } = message;
    let result: string;
    const possibleError = data as unknown as Error;
    if (possibleError && possibleError.message && possibleError.stack) {
      // XXX TODO: The following is an egregious hack which is barely good enough for manual testing
      // but not acceptable for serious use.  We should be passing some kind of proper error
      // indication back so that the recipient will experience a thrown exception or rejected
      // promise, instead of having to look for a magic string.  This is tolerable only so long as
      // the sole eventual recipient is a human eyeball, and even then it's questionable.
      result = `ERROR: ${possibleError.message}`;
    } else {
      result = data as string;
    }
    await reply(type, result);
  };

  const receiveFromControllerSW = async (message: ExtensionMessage) => {
    if (message.target !== 'offscreen') {
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
        const result = await iframeManager.callCapTp(IFRAME_ID, message.data);
        await reply(Command.CapTpCall, JSON.stringify(result, null, 2));
        break;
      }
      case Command.CapTpInit:
        await iframeManager.makeCapTp(IFRAME_ID);
        await reply(Command.CapTpInit, '~~~ CapTP Initialized ~~~');
        break;
      case Command.Ping:
        await reply(Command.Ping, 'pong');
        break;
      case Command.KVGet:
        sendKernelMessage(message.type, message.data);
        break;
      case Command.KVSet:
        sendKernelMessage(message.type, message.data);
        break;
      default:
        console.error(
          // @ts-expect-error The type of `message` is `never`, but this could happen at runtime.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Offscreen received unexpected message type: "${message.type}"`,
        );
    }
  };

  const kernelWorker = new Worker('kernel-worker.js', { type: 'module' });
  kernelWorker.addEventListener('message', makeHandledCallback(receiveFromKernel));

  // Handle messages from the background service worker, which for the time being stands in for the
  // user console.
  chrome.runtime.onMessage.addListener(makeHandledCallback(receiveFromControllerSW));

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

  function sendKernelMessage(type: string, data: DataObject): void {
    kernelWorker.postMessage({ type, data });
  };
}
