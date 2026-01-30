import {
  makeIframeVatWorker,
  PlatformServicesServer,
  createRelayQueryString,
  setupConsoleForwarding,
  stringifyConsoleArg,
} from '@metamask/kernel-browser-runtime';
import type { ConsoleForwardMessage } from '@metamask/kernel-browser-runtime';
import { delay, isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { DuplexStream } from '@metamask/streams';
import {
  initializeMessageChannel,
  ChromeRuntimeDuplexStream,
  MessagePortDuplexStream,
} from '@metamask/streams/browser';
import type { PostMessageTarget } from '@metamask/streams/browser';

const logger = new Logger('offscreen');

main().catch(logger.error);

/**
 * Main function to initialize the offscreen document.
 */
async function main(): Promise<void> {
  // Without this delay, sending messages via the chrome.runtime API can fail.
  await delay(50);

  // Create stream for CapTP messages from the background script
  const backgroundStream = await ChromeRuntimeDuplexStream.make<
    JsonRpcMessage,
    JsonRpcMessage
  >(chrome.runtime, 'offscreen', 'background', isJsonRpcMessage);

  // Set up console forwarding to background for Playwright capture
  setupConsoleForwarding(backgroundStream, 'offscreen');

  // Listen for console messages from vat iframes and forward to background
  window.addEventListener('message', (event) => {
    if (
      event.data !== null &&
      typeof event.data === 'object' &&
      event.data.type === 'console-forward'
    ) {
      const { source, method, args } = event.data as {
        source: string;
        method: 'log' | 'debug' | 'info' | 'warn' | 'error';
        args: unknown[];
      };
      const message: ConsoleForwardMessage = {
        jsonrpc: '2.0',
        method: 'console-forward',
        params: { source, method, args: args.map(stringifyConsoleArg) },
      };
      backgroundStream.write(message).catch(() => {
        // Ignore errors if stream isn't ready
      });
    }
  });

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
  DuplexStream<JsonRpcMessage, JsonRpcMessage>
> {
  // Assign local relay address generated from `yarn ocap relay`
  const relayQueryString = createRelayQueryString([
    '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
    // '/dns4/troll.fudco.com/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
    // '/dns4/troll.fudco.com/tcp/9003/ws/p2p/12D3KooWL9PaFePyNg2hFLpaWPFEPVYGzTvrWAFU9Lk2KoiKqJqR',
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
    JsonRpcMessage,
    JsonRpcMessage
  >(port, isJsonRpcMessage);

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
