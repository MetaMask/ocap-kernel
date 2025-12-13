import {
  connectToKernel,
  rpcMethodSpecs,
} from '@metamask/kernel-browser-runtime';
import defaultSubcluster from '@metamask/kernel-browser-runtime/default-cluster';
import { RpcClient } from '@metamask/kernel-rpc-methods';
import { delay } from '@metamask/kernel-utils';
import type { JsonRpcCall } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { kernelMethodSpecs } from '@metamask/ocap-kernel/rpc';
import { ChromeRuntimeDuplexStream } from '@metamask/streams/browser';
import { isJsonRpcResponse } from '@metamask/utils';
import type { JsonRpcResponse } from '@metamask/utils';

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';
const logger = new Logger('background');
let bootPromise: Promise<void> | null = null;

// Install/update
chrome.runtime.onInstalled.addListener(() => {
  start();
});

// Browser restart / profile startup
chrome.runtime.onStartup.addListener(() => {
  start();
});

// Messages or connections can also kick us awake
chrome.runtime.onMessage.addListener((_msg, _sender, sendResponse) => {
  start();
  sendResponse(true);
  return false;
});
chrome.runtime.onConnect.addListener(() => {
  start();
});

/** Idempotent starter used by all triggers */
function start(): void {
  bootPromise ??= main()
    .catch((error) => {
      logger.error(error);
    })
    .finally(() => {
      // Let future triggers re-run main() if needed
      bootPromise = null;
    });
}

/**
 * Ensure that the offscreen document is created and avoid duplicate creation.
 */
async function ensureOffscreen(): Promise<void> {
  try {
    if (
      chrome.offscreen.hasDocument &&
      (await chrome.offscreen.hasDocument())
    ) {
      return;
    }
  } catch {
    // ignore and attempt creation
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
    justification: `Surely you won't object to our capabilities?`,
  });
}

/**
 * The main function for the background script.
 */
async function main(): Promise<void> {
  await ensureOffscreen();

  // Without this delay, sending messages via the chrome.runtime API can fail.
  await delay(50);

  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    JsonRpcResponse,
    JsonRpcCall
  >(chrome.runtime, 'background', 'offscreen', isJsonRpcResponse);

  const rpcClient = new RpcClient(
    kernelMethodSpecs,
    async (request) => {
      await offscreenStream.write(request);
    },
    'background:',
  );

  const ping = async (): Promise<void> => {
    const result = await rpcClient.call('ping', []);
    logger.info(result);
  };

  // globalThis.kernel will exist due to dev-console.js in background-trusted-prelude.js
  Object.defineProperties(globalThis.kernel, {
    ping: {
      value: ping,
    },
    sendMessage: {
      value: async (message: JsonRpcCall) =>
        await offscreenStream.write(message),
    },
  });
  harden(globalThis.kernel);

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    ping().catch(logger.error);
  });

  // Pipe responses back to the RpcClient
  const drainPromise = offscreenStream.drain(async (message) =>
    rpcClient.handleResponse(message.id as string, message),
  );
  drainPromise.catch(logger.error);

  await ping(); // Wait for the kernel to be ready
  await startDefaultSubcluster();

  try {
    await drainPromise;
  } catch (error) {
    throw new Error('Offscreen connection closed unexpectedly', {
      cause: error,
    });
  }
}

/**
 * Idempotently starts the default subcluster.
 */
async function startDefaultSubcluster(): Promise<void> {
  const kernelStream = await connectToKernel({ label: 'background', logger });
  const rpcClient = new RpcClient(
    rpcMethodSpecs,
    async (request) => {
      await kernelStream.write(request);
    },
    'background',
  );

  kernelStream
    .drain(async (message) =>
      rpcClient.handleResponse(message.id as string, message),
    )
    .catch(logger.error);

  const status = await rpcClient.call('getStatus', []);
  if (status.subclusters.length === 0) {
    const result = await rpcClient.call('launchSubcluster', {
      config: defaultSubcluster,
    });
    logger.info(`Default subcluster launched: ${JSON.stringify(result)}`);
  } else {
    logger.info('Subclusters already exist. Not launching default subcluster.');
  }
}
