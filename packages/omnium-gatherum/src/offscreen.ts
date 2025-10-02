import {
  makeIframeVatWorker,
  PlatformServicesServer,
  createRelayQueryString,
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

  const kernelStream = await makeKernelWorker();

  // Handle messages from the background script / kernel
  await Promise.all([
    kernelStream.pipe(backgroundStream),
    backgroundStream.pipe(kernelStream),
  ]);
}

/**
 * Creates and initializes the kernel worker.
 *
 * @returns The message port stream for worker communication
 */
async function makeKernelWorker(): Promise<
  DuplexStream<JsonRpcResponse, JsonRpcCall>
> {
  // Assign local relay address generated from `yarn ocap relay`
  const relayQueryString = createRelayQueryString([
    '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
  ]);

  const workerUrlParams = new URLSearchParams(relayQueryString);
  workerUrlParams.set('reset-storage', process.env.RESET_STORAGE ?? 'false');

  const workerUrl = new URL('kernel-worker.js', import.meta.url);
  workerUrl.search = workerUrlParams.toString();

  const worker = new Worker(workerUrl, {
    type: 'module',
  });

  const port = await initializeMessageChannel((message, transfer) =>
    worker.postMessage(message, transfer),
  );

  const kernelStream = await MessagePortDuplexStream.make<
    JsonRpcResponse,
    JsonRpcCall
  >(port, isJsonRpcResponse);

  await PlatformServicesServer.make(worker as PostMessageTarget, (vatId) =>
    makeIframeVatWorker({
      id: vatId,
      iframeUri: 'iframe.html',
      getPort: initializeMessageChannel,
      logger: logger.subLogger({
        tags: ['iframe-vat-worker', vatId],
      }),
    }),
  );

  return kernelStream;
}
