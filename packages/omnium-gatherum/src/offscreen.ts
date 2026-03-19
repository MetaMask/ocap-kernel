import {
  makeIframeVatWorker,
  PlatformServicesServer,
  createCommsQueryString,
  setupConsoleForwarding,
  isConsoleForwardMessage,
} from '@metamask/kernel-browser-runtime';
import type { CommsQueryParams } from '@metamask/kernel-browser-runtime';
import { delay, isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { SystemSubclusterConfig } from '@metamask/ocap-kernel';
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

  setupConsoleForwarding({
    source: 'offscreen',
    onMessage: (message) => {
      backgroundStream.write(message).catch(() => undefined);
    },
  });

  // Listen for console messages from vat iframes and forward to background
  window.addEventListener('message', (event) => {
    if (isConsoleForwardMessage(event.data)) {
      backgroundStream.write(event.data).catch(() => undefined);
    }
  });

  const kernelStream = await makeKernelWorker();

  // Handle messages from the background script / kernel
  await Promise.all([
    kernelStream.pipe(backgroundStream),
    backgroundStream.pipe(kernelStream),
  ]);
}

const DEFAULT_RELAYS = [
  '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc',
];

/**
 * Creates and initializes the kernel worker.
 *
 * @param remoteCommsOptions - Options passed to {@link Kernel.initRemoteComms} via the worker URL (relays, allowedWsHosts, etc.); defaults to DEFAULT_RELAYS.
 * @returns The message port stream for worker communication
 */
async function makeKernelWorker(
  remoteCommsOptions?: CommsQueryParams,
): Promise<DuplexStream<JsonRpcMessage, JsonRpcMessage>> {
  const opts = remoteCommsOptions ?? { relays: DEFAULT_RELAYS };
  const workerUrlParams = createCommsQueryString(opts);
  workerUrlParams.set('reset-storage', process.env.RESET_STORAGE ?? 'false');

  // Configure system subclusters to launch at kernel initialization
  const systemSubclusters = [
    {
      name: 'omnium-controllers',
      config: {
        bootstrap: 'omnium-controllers',
        vats: {
          'omnium-controllers': {
            bundleSpec: chrome.runtime.getURL('controller-vat-bundle.json'),
            parameters: {},
            globals: ['Date'],
          },
        },
        services: ['kernelFacet'],
      },
    },
  ] satisfies SystemSubclusterConfig[];
  workerUrlParams.set('system-subclusters', JSON.stringify(systemSubclusters));

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
