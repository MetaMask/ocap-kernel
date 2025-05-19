import {
  makeIframeVatWorker,
  VatWorkerServer,
} from '@metamask/kernel-browser-runtime';
import { delay, isJsonRpcCall } from '@metamask/kernel-utils';
import type { JsonRpcCall } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { DuplexStream } from '@metamask/streams';
import {
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  MessagePortDuplexStream,
} from '@metamask/streams/browser';
import type { PostMessageTarget } from '@metamask/streams/browser';
import type { JsonRpcResponse } from '@metamask/utils';
import { isJsonRpcResponse } from '@metamask/utils';

const logger = new Logger('offscreen');

main().catch(logger.error);

/**
 * Main function to initialize the offscreen document.
 */
async function main(): Promise<void> {
  // Without this delay, sending messages via the chrome.runtime API can fail.
  await delay(50);

  // Create stream for messages from the background script
  const backgroundStream = await ChromeRuntimeDuplexStream.make<
    JsonRpcCall,
    JsonRpcResponse
  >(chrome.runtime, 'offscreen', 'background', isJsonRpcCall);

  const { kernelStream, vatWorkerService } = await makeKernelWorker();

  // Handle messages from the background script / kernel
  await Promise.all([
    vatWorkerService.start(),
    kernelStream.pipe(backgroundStream),
    backgroundStream.pipe(kernelStream),
  ]);
}

/**
 * Creates and initializes the kernel worker.
 *
 * @returns The message port stream for worker communication
 */
async function makeKernelWorker(): Promise<{
  kernelStream: DuplexStream<JsonRpcResponse, JsonRpcCall>;
  vatWorkerService: VatWorkerServer;
}> {
  const worker = new Worker('kernel-worker/index.mjs', { type: 'module' });

  const port = await initializeMessageChannel((message, transfer) =>
    worker.postMessage(message, transfer),
  );

  const kernelStream = await MessagePortDuplexStream.make<
    JsonRpcResponse,
    JsonRpcCall
  >(port, isJsonRpcResponse);

  const vatWorkerService = VatWorkerServer.make(
    worker as PostMessageTarget,
    (vatId) =>
      makeIframeVatWorker({
        id: vatId,
        getPort: initializeMessageChannel,
        logger: logger.subLogger({
          tags: ['iframe-vat-worker', vatId],
        }),
      }),
  );

  return {
    kernelStream,
    vatWorkerService,
  };
}
