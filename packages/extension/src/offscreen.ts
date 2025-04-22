import { isJsonRpcResponse } from '@metamask/utils';
import type { JsonRpcResponse } from '@metamask/utils';
import type { DuplexStream } from '@ocap/streams';
import {
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  MessagePortDuplexStream,
} from '@ocap/streams/browser';
import type { PostMessageTarget } from '@ocap/streams/browser';
import { delay, isJsonRpcCall, Logger } from '@ocap/utils';
import type { JsonRpcCall } from '@ocap/utils';

import { makeIframeVatWorker } from './kernel-integration/iframe-vat-worker.ts';
import { ExtensionVatWorkerService } from './kernel-integration/VatWorkerServer.ts';

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
  vatWorkerService: ExtensionVatWorkerService;
}> {
  const worker = new Worker('kernel-worker.js', { type: 'module' });

  const port = await initializeMessageChannel((message, transfer) =>
    worker.postMessage(message, transfer),
  );

  const kernelStream = await MessagePortDuplexStream.make<
    JsonRpcResponse,
    JsonRpcCall
  >(port, isJsonRpcResponse);

  const vatWorkerService = ExtensionVatWorkerService.make(
    worker as PostMessageTarget,
    (vatId) =>
      makeIframeVatWorker(
        vatId,
        initializeMessageChannel,
        logger.subLogger({
          tags: ['iframe-vat-worker', vatId],
        }),
      ),
  );

  return {
    kernelStream,
    vatWorkerService,
  };
}
