import { E } from '@endo/eventual-send';
import {
  makeBackgroundCapTP,
  makePresenceManager,
  makeCapTPNotification,
  isCapTPNotification,
  getCapTPMessage,
} from '@metamask/kernel-browser-runtime';
import type {
  KernelFacade,
  CapTPMessage,
} from '@metamask/kernel-browser-runtime';
import defaultSubcluster from '@metamask/kernel-browser-runtime/default-cluster';
import { delay, isJsonRpcMessage } from '@metamask/kernel-utils';
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
  globalThis.kernel = kernelP;

  // Create presence manager for E() calls on vat objects
  const presenceManager = makePresenceManager({ kernelFacade: kernelP });
  Object.assign(globalThis.captp, presenceManager);

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    E(kernelP).ping().catch(logger.error);
  });

  // Handle incoming CapTP messages from the kernel
  const drainPromise = offscreenStream.drain((message) => {
    if (isCapTPNotification(message)) {
      const captpMessage = getCapTPMessage(message);
      backgroundCapTP.dispatch(captpMessage);
    }
  });
  drainPromise.catch(logger.error);

  await E(kernelP).ping(); // Wait for the kernel to be ready
  const rootKref = await startDefaultSubcluster(kernelP);
  if (rootKref) {
    await greetBootstrapVat(rootKref);
  }

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
 *
 * @param kernelPromise - Promise for the kernel facade.
 * @returns The rootKref of the bootstrap vat if launched, undefined if subcluster already exists.
 */
async function startDefaultSubcluster(
  kernelPromise: Promise<KernelFacade>,
): Promise<string | undefined> {
  const kernel = await kernelPromise;
  const status = await E(kernel).getStatus();

  if (status.subclusters.length === 0) {
    const result = await E(kernel).launchSubcluster(defaultSubcluster);
    logger.info(`Default subcluster launched: ${JSON.stringify(result)}`);
    return result.rootKref;
  }
  logger.info('Subclusters already exist. Not launching default subcluster.');
  return undefined;
}

/**
 * Greets the bootstrap vat by calling its hello() method.
 *
 * @param rootKref - The kref of the bootstrap vat's root object.
 */
async function greetBootstrapVat(rootKref: string): Promise<void> {
  const rootPresence = captp.resolveKref(rootKref) as {
    hello: (from: string) => string;
  };
  const greeting = await E(rootPresence).hello('background');
  logger.info(`Got greeting from bootstrap vat: ${greeting}`);
}

/**
 * Define globals accessible via the background console.
 */
function defineGlobals(): void {
  Object.defineProperty(globalThis, 'kernel', {
    configurable: false,
    enumerable: true,
    writable: true,
    value: {},
  });

  Object.defineProperty(globalThis, 'captp', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: {},
  });

  Object.defineProperty(globalThis, 'E', {
    value: E,
    configurable: false,
    enumerable: true,
    writable: false,
  });
}
