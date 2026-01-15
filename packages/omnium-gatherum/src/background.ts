import { E } from '@endo/eventual-send';
import {
  makeBackgroundCapTP,
  makeCapTPNotification,
  isCapTPNotification,
  getCapTPMessage,
} from '@metamask/kernel-browser-runtime';
import type { CapTPMessage } from '@metamask/kernel-browser-runtime';
import { delay, isJsonRpcMessage, stringify } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { ChromeRuntimeDuplexStream } from '@metamask/streams/browser';

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

  // Create stream for CapTP messages
  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    JsonRpcMessage,
    JsonRpcMessage
  >(chrome.runtime, 'background', 'offscreen', isJsonRpcMessage);

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
  const kernelP = backgroundCapTP.getKernel();

  const ping = async (): Promise<void> => {
    const result = await E(kernelP).ping();
    logger.info(result);
  };

  Object.defineProperties(globalThis.omnium, {
    ping: {
      value: ping,
    },
    getKernel: {
      value: async () => kernelP,
    },
  });
  harden(globalThis.omnium);

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    ping().catch(logger.error);
  });

  try {
    // Handle incoming CapTP messages from the kernel
    await offscreenStream.drain((message) => {
      if (isCapTPNotification(message)) {
        const captpMessage = getCapTPMessage(message);
        backgroundCapTP.dispatch(captpMessage);
      } else {
        throw new Error(`Unexpected message: ${stringify(message)}`);
      }
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
