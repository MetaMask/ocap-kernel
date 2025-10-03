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

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    ping().catch(logger.error);
  });

  try {
    // Pipe responses back to the RpcClient
    await offscreenStream.drain(async (message) =>
      rpcClient.handleResponse(message.id as string, message),
    );
  } catch (error) {
    throw new Error('Offscreen connection closed unexpectedly', {
      cause: error,
    });
  }
}
