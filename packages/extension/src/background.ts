import { E } from '@endo/eventual-send';
import { makeBackgroundHostVat } from '@metamask/kernel-browser-runtime';
import defaultSubcluster from '@metamask/kernel-browser-runtime/default-cluster';
import { delay, isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { ChromeRuntimeDuplexStream } from '@metamask/streams/browser';

defineGlobals();

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';
const logger = new Logger('background');
let bootPromise: Promise<void> | null = null;

// With this we can click the extension action button to wake up the service worker.
chrome.action.onClicked.addListener(() => {
  globalThis.kernel !== undefined &&
    E(globalThis.kernel).getStatus().catch(logger.error);
});

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

  // Create stream for JSON-RPC messages to kernel
  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    JsonRpcMessage,
    JsonRpcMessage
  >(chrome.runtime, 'background', 'offscreen', isJsonRpcMessage);

  // Create host vat - captures kernelFacet from bootstrap automatically
  const hostVat = makeBackgroundHostVat({ logger });

  // Connect to kernel via offscreen pipe
  hostVat.connect(offscreenStream);

  globalThis.kernel = hostVat.kernelFacetPromise;

  // Verify connectivity and start default subcluster
  await E(kernel).getStatus();
  await startDefaultSubcluster();
}

/**
 * Idempotently starts the default subcluster.
 * Must be called after globalThis.kernel is set.
 */
async function startDefaultSubcluster(): Promise<void> {
  const { kernel } = globalThis;
  if (kernel === undefined) {
    throw new Error('Kernel not initialized');
  }

  const status = await E(kernel).getStatus();
  if (status.subclusters.length === 0) {
    const result = await E(kernel).launchSubcluster(defaultSubcluster);
    logger.info(`Default subcluster launched: ${JSON.stringify(result)}`);
  } else {
    logger.info('Subclusters already exist. Not launching default subcluster.');
  }
}

/**
 * Define globals accessible via the background console.
 */
function defineGlobals(): void {
  Object.defineProperty(globalThis, 'kernel', {
    configurable: false,
    enumerable: true,
    writable: true,
    value: undefined,
  });

  Object.defineProperty(globalThis, 'E', {
    value: E,
    configurable: false,
    enumerable: true,
    writable: false,
  });
}
