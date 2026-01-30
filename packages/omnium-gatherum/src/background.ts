import { E } from '@endo/eventual-send';
import { makeBackgroundHostVat } from '@metamask/kernel-browser-runtime';
import { delay, isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { ChromeRuntimeDuplexStream } from '@metamask/streams/browser';

import { initializeControllers } from './controllers/index.ts';
import type {
  CapletControllerFacet,
  CapletManifest,
} from './controllers/index.ts';

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';
const logger = new Logger('background');
const globals = defineGlobals();
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

  // Wait for kernel facet (resolves after bootstrap)
  const kernelFacet = await hostVat.kernelFacetPromise;
  globalThis.kernel = kernelFacet;

  // Initialize controllers with kernel facet
  const controllers = await initializeControllers({
    logger,
    kernel: kernelFacet,
  });
  globals.setCapletController(controllers.caplet);
}

type GlobalSetters = {
  setCapletController: (value: CapletControllerFacet) => void;
};

/**
 * Define globals accessible via the background console.
 *
 * @returns A device for setting the global values.
 */
function defineGlobals(): GlobalSetters {
  let capletController: CapletControllerFacet;

  Object.defineProperty(globalThis, 'E', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: E,
  });

  Object.defineProperty(globalThis, 'kernel', {
    configurable: false,
    enumerable: true,
    writable: true,
    value: undefined,
  });

  Object.defineProperty(globalThis, 'omnium', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: {},
  });

  /**
   * Load a caplet's manifest and bundle by ID.
   *
   * @param id - The short caplet ID (e.g., 'echo').
   * @returns The manifest and bundle for installation.
   */
  const loadCaplet = async (
    id: string,
  ): Promise<{ manifest: CapletManifest; bundle: unknown }> => {
    const baseUrl = chrome.runtime.getURL('');
    const capletBaseUrl = `${baseUrl}${id}/`;

    // Fetch manifest
    const manifestUrl = `${capletBaseUrl}manifest.json`;
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) {
      throw new Error(`Failed to fetch manifest for caplet "${id}"`);
    }
    const manifestData = (await manifestResponse.json()) as CapletManifest;

    // Resolve bundleSpec to absolute URL
    const bundleSpec = `${capletBaseUrl}${manifestData.bundleSpec}`;
    const manifest: CapletManifest = {
      ...manifestData,
      bundleSpec,
    };

    // Fetch bundle
    const bundleResponse = await fetch(bundleSpec);
    if (!bundleResponse.ok) {
      throw new Error(`Failed to fetch bundle for caplet "${id}"`);
    }
    const bundle: unknown = await bundleResponse.json();

    return { manifest, bundle };
  };

  Object.defineProperties(globalThis.omnium, {
    caplet: {
      value: harden({
        install: async (manifest: CapletManifest) =>
          E(capletController).install(manifest),
        uninstall: async (capletId: string) =>
          E(capletController).uninstall(capletId),
        list: async () => E(capletController).list(),
        load: loadCaplet,
        get: async (capletId: string) => E(capletController).get(capletId),
        getRoot: async (capletId: string) =>
          E(capletController).getCapletRoot(capletId),
      }),
    },
  });
  harden(globalThis.omnium);

  return {
    setCapletController: (value) => {
      capletController = value;
    },
  };
}
