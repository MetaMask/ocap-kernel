import { isKernelCommand, isKernelCommandReply } from '@ocap/kernel';
import type { KernelCommandReply, KernelCommand } from '@ocap/kernel';
import {
  ChromeRuntimeTarget,
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  MessagePortDuplexStream,
} from '@ocap/streams';
import { makeLogger } from '@ocap/utils';

import { makeIframeVatWorker } from './iframe-vat-worker.js';
import { ExtensionVatWorkerServer } from './VatWorkerServer.js';

const logger = makeLogger('[ocap glue]');

main().catch((error) => logger.error(error));

/**
 * The main function for the offscreen script.
 */
async function main(): Promise<void> {
  // Without this delay, sending messages via the chrome.runtime API can fail.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const backgroundStream = await ChromeRuntimeDuplexStream.make(
    chrome.runtime,
    ChromeRuntimeTarget.Offscreen,
    ChromeRuntimeTarget.Background,
  );

  const kernelWorker = await makeKernelWorker();

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
    kernelWorker.receiveMessages(),
    (async () => {
      for await (const message of backgroundStream) {
        if (!isKernelCommand(message)) {
          logger.error('Offscreen received unexpected message', message);
          continue;
        }

        await kernelWorker.sendMessage(message);
      }
    })(),
  ]);

  /**
   * Make the SQLite kernel worker.
   *
   * @returns An object with methods to send and receive messages from the kernel worker.
   */
  async function makeKernelWorker(): Promise<{
    sendMessage: (message: KernelCommand) => Promise<void>;
    receiveMessages: () => Promise<void>;
  }> {
    const worker = new Worker('kernel-worker.js', { type: 'module' });

    const workerStream = await initializeMessageChannel((message, transfer) =>
      worker.postMessage(message, transfer),
    ).then(async (port) =>
      MessagePortDuplexStream.make<KernelCommandReply, KernelCommand>(port),
    );

    const vatWorkerServer = new ExtensionVatWorkerServer(
      (message, transfer?) =>
        transfer
          ? worker.postMessage(message, transfer)
          : worker.postMessage(message),
      (listener) => worker.addEventListener('message', listener),
      (vatId) => makeIframeVatWorker(vatId, initializeMessageChannel),
    );

    vatWorkerServer.start();

    const receiveMessages = async (): Promise<void> => {
      // For the time being, the only messages that come from the kernel worker are replies to actions
      // initiated from the console, so just forward these replies to the console.  This will need to
      // change once this offscreen script is providing services to the kernel worker that don't
      // involve the user.
      for await (const message of workerStream) {
        if (!isKernelCommandReply(message)) {
          logger.error('Kernel sent unexpected reply', message);
          continue;
        }

        await replyToBackground(message);
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
