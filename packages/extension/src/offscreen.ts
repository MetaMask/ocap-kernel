import { isKernelCommandReply } from '@ocap/kernel';
import type { KernelCommandReply, KernelCommand } from '@ocap/kernel';
import {
  ChromeRuntimeTarget,
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  MessagePortDuplexStream,
  StreamMultiplexer,
} from '@ocap/streams';
import type { DuplexStream, MultiplexEnvelope } from '@ocap/streams';
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

type PanelStream = DuplexStream<KernelControlReply, KernelControlCommand>;

type HandleStreamChange = (stream?: PopupStream | undefined) => void;

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

  let popupStream: PopupStream | undefined;
  const panelChannel: PanelStream = workerMultiplexer.createChannel(
    'panel',
    isKernelControlReply,
  );
  makePopupConnection(panelChannel, (stream) => {
    popupStream = stream;
  });

  // Handle messages from the background script and the multiplexer
  await Promise.all([
    workerMultiplexer.start(),
    kernelChannel.pipe(backgroundStream),
    backgroundStream.pipe(kernelChannel),
    panelChannel.drain(async (value) => {
      await popupStream?.write(value);
    }),
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
 * Handles connecting and reconnecting to the popup.
 *
 * @param panelStream - The panel stream.
 * @param handleStreamChange - Callback to handle the created stream.
 */
function makePopupConnection(
  panelStream: PanelStream,
  handleStreamChange: HandleStreamChange,
): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'popup') {
      return;
    }

    handleChromePort(port, panelStream, handleStreamChange).catch((error) => {
      logger.error(error);
      handleStreamChange();
    });
  });
}

/**
 * Handles receiving a connection from the popup.
 *
 * @param port - The port to connect to the popup.
 * @param panelStream - The panel channel from the multiplexer.
 * @param handleStreamChange - Callback to handle the created stream.
 */
async function handleChromePort(
  port: chrome.runtime.Port,
  panelStream: PanelStream,
  handleStreamChange: HandleStreamChange,
): Promise<void> {
  const popupStream: PopupStream = await ChromeRuntimeDuplexStream.make(
    chrome.runtime,
    ChromeRuntimeTarget.Offscreen,
    ChromeRuntimeTarget.Popup,
  );

  // Setup cleanup for when popup closes
  port.onDisconnect.addListener(() => {
    popupStream.return().catch(logger.error);
    handleStreamChange();
  });
  handleStreamChange(popupStream);

  await popupStream.pipe(panelStream);
}
