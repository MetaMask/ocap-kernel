import { isKernelCommand, isKernelCommandReply } from '@ocap/kernel';
import type { KernelCommandReply, KernelCommand } from '@ocap/kernel';
import {
  ChromeRuntimeTarget,
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  MessagePortDuplexStream,
  StreamMultiplexer,
} from '@ocap/streams';
import type { HandledDuplexStream, MultiplexEnvelope } from '@ocap/streams';
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

  const workerStream = await setupKernelWorker();

  // Create multiplexer for worker communication
  const multiplexer = new StreamMultiplexer(
    workerStream,
    'OffscreenMultiplexer',
  );

  // Add kernel channel
  const kernelChannel = multiplexer.addChannel<
    KernelCommandReply,
    KernelCommand
  >('kernel', async (reply) => {
    if (isKernelCommandReply(reply)) {
      await backgroundStream.write(reply);
    }
  });

  let popupStream: ChromeRuntimeDuplexStream<
    KernelControlCommand,
    KernelControlReply
  > | null = null;

  // Add panel channel
  const panelChannel = multiplexer.addChannel<
    KernelControlReply,
    KernelControlCommand
  >('panel', async (reply) => {
    if (isKernelControlReply(reply) && popupStream) {
      await popupStream.write(reply);
    }
  });

  // Setup popup communication
  setupPopupStream(panelChannel, (stream) => {
    popupStream = stream;
  });

  // Handle messages from the background script and the multiplexer
  await Promise.all([
    multiplexer.drainAll(),
    (async () => {
      for await (const message of backgroundStream) {
        if (!isKernelCommand(message)) {
          logger.error('Offscreen received unexpected message', message);
          continue;
        }
        await kernelChannel.write(message);
      }
    })(),
  ]);
}

/**
 * Creates and initializes the kernel worker.
 *
 * @returns The message port stream for worker communication
 */
async function setupKernelWorker(): Promise<
  MessagePortDuplexStream<MultiplexEnvelope, MultiplexEnvelope>
> {
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

  return workerStream;
}

/**
 * Sets up the popup communication stream.
 *
 * @param panelChannel - The panel channel from the multiplexer
 * @param onStreamCreated - Callback to handle the created stream
 */
function setupPopupStream(
  panelChannel: HandledDuplexStream<KernelControlReply, KernelControlCommand>,
  onStreamCreated: (
    stream: ChromeRuntimeDuplexStream<
      KernelControlCommand,
      KernelControlReply
    > | null,
  ) => void,
): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'popup') {
      return;
    }

    // Handle stream creation
    handlePopupConnection(port, panelChannel, onStreamCreated).catch(
      (error) => {
        logger.error(error);
        onStreamCreated(null);
      },
    );
  });
}

/**
 * Handles the popup connection.
 *
 * @param port - The port to connect to the popup.
 * @param panelChannel - The panel channel from the multiplexer.
 * @param onStreamCreated - Callback to handle the created stream.
 */
async function handlePopupConnection(
  port: chrome.runtime.Port,
  panelChannel: HandledDuplexStream<KernelControlReply, KernelControlCommand>,
  onStreamCreated: (
    stream: ChromeRuntimeDuplexStream<
      KernelControlCommand,
      KernelControlReply
    > | null,
  ) => void,
): Promise<void> {
  const stream = await ChromeRuntimeDuplexStream.make<
    KernelControlCommand,
    KernelControlReply
  >(chrome.runtime, ChromeRuntimeTarget.Offscreen, ChromeRuntimeTarget.Popup);

  // Setup cleanup for when popup closes
  port.onDisconnect.addListener(() => {
    stream.return().catch(console.error);
    onStreamCreated(null);
  });

  onStreamCreated(stream);

  // Start handling messages
  await stream.drain(async (message) => {
    await panelChannel.write(message);
  });
}
