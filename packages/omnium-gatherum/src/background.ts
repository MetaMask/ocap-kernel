import { E } from '@endo/eventual-send';
import { RpcClient } from '@metamask/kernel-rpc-methods';
import { delay, isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { kernelMethodSpecs } from '@metamask/ocap-kernel/rpc';
import { ChromeRuntimeDuplexStream } from '@metamask/streams/browser';
import { isJsonRpcResponse } from '@metamask/utils';

import {
  makeBackgroundCapTP,
  makeCapTPNotification,
  isCapTPNotification,
  getCapTPMessage,
} from './captp/index.ts';
import type { KernelFacade, CapTPMessage } from './captp/index.ts';

defineGlobals();

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

  // Create stream that supports both RPC and CapTP messages
  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    JsonRpcMessage,
    JsonRpcMessage
  >(chrome.runtime, 'background', 'offscreen', isJsonRpcMessage);

  // Set up RpcClient for backward compatibility with existing RPC methods
  const rpcClient = new RpcClient(
    kernelMethodSpecs,
    async (request) => {
      await offscreenStream.write(request);
    },
    'background:',
  );

  // Set up CapTP for E() based communication with the kernel
  const backgroundCapTP = makeBackgroundCapTP({
    send: (captpMessage: CapTPMessage) => {
      const notification = makeCapTPNotification(captpMessage);
      offscreenStream.write(notification).catch((error) => {
        logger.error('Failed to send CapTP message:', error);
      });
    },
  });

  // Get the kernel remote presence
  const kernelPromise = backgroundCapTP.getKernel();

  const ping = async (): Promise<void> => {
    const result = await rpcClient.call('ping', []);
    logger.info(result);
  };

  // Helper to get the kernel remote presence (for use with E())
  const getKernel = async (): Promise<KernelFacade> => {
    return kernelPromise;
  };

  Object.defineProperties(globalThis.omnium, {
    ping: {
      value: ping,
    },
    getKernel: {
      value: getKernel,
    },
  });
  harden(globalThis.omnium);

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    ping().catch(logger.error);
  });

  try {
    // Handle all incoming messages
    await offscreenStream.drain(async (message) => {
      if (isCapTPNotification(message)) {
        // Dispatch CapTP messages
        const captpMessage = getCapTPMessage(message);
        backgroundCapTP.dispatch(captpMessage);
      } else if (isJsonRpcResponse(message)) {
        // Handle RPC responses
        rpcClient.handleResponse(message.id as string, message);
      }
      // Ignore other message types
    });
  } catch (error) {
    throw new Error('Offscreen connection closed unexpectedly', {
      cause: error,
    });
  }
}

/**
 * Define globals accessible via the background console.
 */
function defineGlobals(): void {
  Object.defineProperty(globalThis, 'omnium', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: {},
  });

  Object.defineProperty(globalThis, 'E', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: E,
  });
}
