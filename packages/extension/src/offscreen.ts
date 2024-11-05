import { isKernelCommand, isKernelCommandReply } from '@ocap/kernel';
import type { KernelCommandReply, KernelCommand } from '@ocap/kernel';
import {
  ChromeRuntimeTarget,
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  MessagePortDuplexStream,
} from '@ocap/streams';
import { makeLogger } from '@ocap/utils';

import { makeIframeVatWorker } from './kernel/iframe-vat-worker.js';
import { isKernelControlReply } from './kernel/messages.js';
import type {
  KernelControlCommand,
  KernelControlReply,
} from './kernel/messages.js';
import { ExtensionVatWorkerServer } from './kernel/VatWorkerServer.js';

const logger = makeLogger('[ocap glue]');

main().catch(logger.error);

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

  const replyToPopup = setupPopupStream();

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
    sendMessage: (
      message: KernelCommand | KernelControlCommand,
    ) => Promise<void>;
    receiveMessages: () => Promise<void>;
  }> {
    const worker = new Worker('kernel-worker.js', { type: 'module' });

    const workerStream = await initializeMessageChannel((message, transfer) =>
      worker.postMessage(message, transfer),
    ).then(async (port) =>
      MessagePortDuplexStream.make<
        KernelCommandReply | KernelControlReply,
        KernelCommand | KernelControlCommand
      >(port),
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
        if (isKernelCommandReply(message)) {
          await replyToBackground(message);
          continue;
        } else if (isKernelControlReply(message)) {
          await replyToPopup(message);
          continue;
        }

        logger.error('Kernel sent unexpected reply', message);
      }
    };

    const sendMessage = async (
      message: KernelCommand | KernelControlCommand,
    ): Promise<void> => {
      await workerStream.write(message);
    };

    return {
      sendMessage,
      receiveMessages,
    };
  }

  /**
   * Set up the popup stream.
   *
   * @returns A function that sends messages to the popup.
   */
  function setupPopupStream(): (message: KernelControlReply) => Promise<void> {
    let sendToPopup = async (message: KernelControlReply): Promise<void> => {
      logger.log('Offscreen sending message to popup before setup:', message);
    };

    // Set up the stream to the popup every time the popup shows.
    // This is necessary because the stream is closed when the popup is closed.
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'popup') {
        ChromeRuntimeDuplexStream.make<
          KernelControlCommand,
          KernelControlReply
        >(
          chrome.runtime,
          ChromeRuntimeTarget.Offscreen,
          ChromeRuntimeTarget.Popup,
        )
          .then(async (stream) => {
            // Close the stream when the popup is closed
            port.onDisconnect.addListener(() => {
              // eslint-disable-next-line promise/no-nesting
              stream.return().catch(console.error);
            });

            sendToPopup = async (message) => {
              logger.log('Offscreen sending message to popup:', message);
              await stream.write(message);
            };

            return stream.drain(async (message) => {
              console.log('Offscreen received message from popup:', message);
              await kernelWorker.sendMessage(message);
            });
          })
          .catch(logger.error);
      }
    });

    return sendToPopup;
  }
}
