import { makePromiseKit } from '@endo/promise-kit';
import {
  isKernelCommand,
  isKernelCommandReply,
  KernelCommandMethod,
} from '@ocap/kernel';
import type { KernelCommandReply, KernelCommand, VatId } from '@ocap/kernel';
import {
  ChromeRuntimeTarget,
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  PostMessageDuplexStream,
} from '@ocap/streams';
import { makeLogger } from '@ocap/utils';

import { makeIframeVatWorker } from './iframe-vat-worker.js';
import { ExtensionVatWorkerServer } from './VatWorkerServer.js';

const logger = makeLogger('[ocap glue]');

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

  const kernelWorker = makeKernelWorker();
  const kernelInit =
    makePromiseKit<
      Extract<
        KernelCommandReply,
        { method: typeof KernelCommandMethod.InitKernel }
      >['params']
    >();

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

  // Handle messages from the background service worker and the kernel SQLite worker.
  await Promise.all([
    (async () => {
      for await (const message of backgroundStream) {
        await kernelInit.promise;
        isKernelCommand(message)
          ? await kernelWorker.sendMessage(message)
          : logger.debug('Received unexpected message', message);
      }
    })(),
    kernelWorker.receiveMessages(),
  ]);

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
      // involve the user.
      for await (const message of workerStream) {
        if (!isKernelCommandReply(message)) {
          logger.debug('Received unexpected reply', message);
        }
        if (message.method === KernelCommandMethod.InitKernel) {
          kernelInit.resolve(message.params);
        }
        await replyToBackground(message);
      }
    };

    const sendMessage = async (message: KernelCommand): Promise<void> => {
      await workerStream.write(message);
    };

    const vatWorkerServer = new ExtensionVatWorkerServer(
      (message: unknown, transfer?: Transferable[]) =>
        transfer
          ? worker.postMessage(message, transfer)
          : worker.postMessage(message),
      (listener) => worker.addEventListener('message', listener),
      (vatId: VatId) => makeIframeVatWorker(vatId, initializeMessageChannel),
    );

    vatWorkerServer.start();

    return {
      sendMessage,
      receiveMessages,
    };
  }
}
