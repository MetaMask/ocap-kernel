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
 * Main function to initialize the offscreen page.
 */
async function main(): Promise<void> {
  // Without this delay, sending messages via the chrome.runtime API can fail.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const backgroundStream = await setupBackgroundStream();

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
 * Creates and sets up communication with the background script.
 *
 * @returns A duplex stream for background communication
 */
async function setupBackgroundStream(): Promise<
  ChromeRuntimeDuplexStream<KernelCommand, KernelCommandReply>
> {
  return ChromeRuntimeDuplexStream.make<KernelCommand, KernelCommandReply>(
    chrome.runtime,
    ChromeRuntimeTarget.Offscreen,
    ChromeRuntimeTarget.Background,
  );
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
    if (port.name === 'popup') {
      ChromeRuntimeDuplexStream.make<KernelControlCommand, KernelControlReply>(
        chrome.runtime,
        ChromeRuntimeTarget.Offscreen,
        ChromeRuntimeTarget.Popup,
      )
        .then(async (stream) => {
          // Close the stream when the popup is closed
          port.onDisconnect.addListener(() => {
            // eslint-disable-next-line promise/no-nesting
            stream.return().catch(console.error);
            onStreamCreated(null);
          });

          onStreamCreated(stream);

          return stream.drain(async (message) => {
            logger.log('sending message to kernel from popup', message);
            await panelChannel.write(message);
          });
        })
        .catch((error) => {
          logger.error(error);
          onStreamCreated(null);
        });
    }
  });
}
