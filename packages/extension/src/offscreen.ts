import { isKernelCommandReply } from '@ocap/kernel';
import type { KernelCommandReply, KernelCommand } from '@ocap/kernel';
import {
  ChromeRuntimeTarget,
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  MessagePortDuplexStream,
  StreamMultiplexer,
} from '@ocap/streams';
import type { MultiplexEnvelope, PostMessageTarget } from '@ocap/streams';
import { delay, makeLogger } from '@ocap/utils';

import { makeIframeVatWorker } from './kernel-integration/iframe-vat-worker.js';
import { ExtensionVatWorkerServer } from './kernel-integration/VatWorkerServer.js';

const logger = makeLogger('[offscreen]');

main().catch(logger.error);

/**
 * Main function to initialize the offscreen document.
 */
async function main(): Promise<void> {
  // Without this delay, sending messages via the chrome.runtime API can fail.
  await delay(50);

  // Create stream for messages from the background script
  const backgroundStream = await ChromeRuntimeDuplexStream.make<
    KernelCommand,
    KernelCommandReply
  >(
    chrome.runtime,
    ChromeRuntimeTarget.Offscreen,
    ChromeRuntimeTarget.Background,
  );

  const { workerMultiplexer, vatWorkerServer } = await makeKernelWorker();

  const kernelChannel = workerMultiplexer.createChannel<
    KernelCommandReply,
    KernelCommand
  >('kernel', isKernelCommandReply);

  // Handle messages from the background script and the multiplexer
  await Promise.all([
    workerMultiplexer.start(),
    vatWorkerServer.start(),
    kernelChannel.pipe(backgroundStream),
    backgroundStream.pipe(kernelChannel),
  ]);
}

/**
 * Creates and initializes the kernel worker.
 *
 * @returns The message port stream for worker communication
 */
async function makeKernelWorker(): Promise<{
  workerMultiplexer: StreamMultiplexer;
  vatWorkerServer: ExtensionVatWorkerServer;
}> {
  const worker = new Worker('kernel-worker.js', { type: 'module' });

  const port = await initializeMessageChannel((message, transfer) =>
    worker.postMessage(message, transfer),
  );

  const workerStream = await MessagePortDuplexStream.make<
    MultiplexEnvelope,
    MultiplexEnvelope
  >(port);

  const vatWorkerServer = ExtensionVatWorkerServer.make(
    worker as PostMessageTarget,
    (vatId) => makeIframeVatWorker(vatId, initializeMessageChannel),
  );

  return {
    workerMultiplexer: new StreamMultiplexer(
      workerStream,
      'OffscreenMultiplexer',
    ),
    vatWorkerServer,
  };
}
