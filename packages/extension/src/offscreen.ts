import { makePromiseKit } from '@endo/promise-kit';
import { isKernelCommandReply } from '@ocap/kernel';
import type { KernelCommandReply, KernelCommand } from '@ocap/kernel';
import {
  ChromeRuntimeTarget,
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  MessagePortDuplexStream,
  StreamMultiplexer,
} from '@ocap/streams';
import type { MultiplexEnvelope } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';

import { makeIframeVatWorker } from './kernel/iframe-vat-worker.js';
import { isKernelControlReply } from './kernel/messages.js';
import type {
  KernelControlCommand,
  KernelControlReply,
} from './kernel/messages.js';
import { ExtensionVatWorkerServer } from './kernel/VatWorkerServer.js';

const logger = makeLogger('[offscreen]');

main().catch(logger.error);

type PopupStream = ChromeRuntimeDuplexStream<
  KernelControlCommand,
  KernelControlReply
>;

/**
 * Main function to initialize the offscreen document.
 */
async function main(): Promise<void> {
  // Without this delay, sending messages via the chrome.runtime API can fail.
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Create stream for messages from the background script
  const backgroundStream = await ChromeRuntimeDuplexStream.make<
    KernelCommand,
    KernelCommandReply
  >(
    chrome.runtime,
    ChromeRuntimeTarget.Offscreen,
    ChromeRuntimeTarget.Background,
  );

  const workerMultiplexer = await makeKernelWorker();

  const kernelChannel = workerMultiplexer.createChannel<
    KernelCommandReply,
    KernelCommand
  >('kernel', isKernelCommandReply);

  const panelChannel = workerMultiplexer.createChannel<
    KernelControlReply,
    KernelControlCommand
  >('panel', isKernelControlReply);

  const popupStream = await makePopupStream();

  // Handle messages from the background script and the multiplexer
  await Promise.all([
    workerMultiplexer.start(),
    kernelChannel.pipe(backgroundStream),
    backgroundStream.pipe(kernelChannel),
    panelChannel.pipe(popupStream),
    popupStream.pipe(panelChannel),
  ]);
}

/**
 * Creates and initializes the kernel worker.
 *
 * @returns The message port stream for worker communication
 */
async function makeKernelWorker(): Promise<StreamMultiplexer> {
  const worker = new Worker('kernel-worker.js', { type: 'module' });

  const port = await initializeMessageChannel((message, transfer) =>
    worker.postMessage(message, transfer),
  );

  const workerStream = await MessagePortDuplexStream.make<
    MultiplexEnvelope,
    MultiplexEnvelope
  >(port);

  const vatWorkerServer = new ExtensionVatWorkerServer(
    (message, transfer?) =>
      transfer
        ? worker.postMessage(message, transfer)
        : worker.postMessage(message),
    (listener) => worker.addEventListener('message', listener),
    (vatId) => makeIframeVatWorker(vatId, initializeMessageChannel),
  );

  vatWorkerServer.start();

  return new StreamMultiplexer(workerStream, 'OffscreenMultiplexer');
}

/**
 * Creates the popup communication stream.
 *
 * @returns The popup stream
 */
async function makePopupStream(): Promise<PopupStream> {
  const chromePort = await getPopupPort();
  const popupStream = await ChromeRuntimeDuplexStream.make<
    KernelControlCommand,
    KernelControlReply
  >(chrome.runtime, ChromeRuntimeTarget.Offscreen, ChromeRuntimeTarget.Popup);

  chromePort.onDisconnect.addListener(() => {
    popupStream.return().catch(console.error);
  });

  return popupStream;
}

/**
 * Gets the Chrome runtime port for the popup.
 *
 * @returns The Chrome runtime port
 */
async function getPopupPort(): Promise<chrome.runtime.Port> {
  const { promise, resolve } = makePromiseKit<chrome.runtime.Port>();
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'popup') {
      return;
    }
    resolve(port);
  });
  return promise;
}
