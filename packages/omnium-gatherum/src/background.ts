import { E } from '@endo/eventual-send';
import {
  makeBackgroundCapTP,
  makeCapTPNotification,
  isCapTPNotification,
  getCapTPMessage,
} from '@metamask/kernel-browser-runtime';
import type {
  CapTPMessage,
  KernelFacade,
} from '@metamask/kernel-browser-runtime';
import { delay, isJsonRpcMessage, stringify } from '@metamask/kernel-utils';
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
  omnium.ping?.().catch(logger.error);
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

  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    JsonRpcMessage,
    JsonRpcMessage
  >(chrome.runtime, 'background', 'offscreen', isJsonRpcMessage);

  const backgroundCapTP = makeBackgroundCapTP({
    send: (captpMessage: CapTPMessage) => {
      const notification = makeCapTPNotification(captpMessage);
      offscreenStream.write(notification).catch((error) => {
        logger.error('Failed to send CapTP message:', error);
      });
    },
  });

  const kernelP = backgroundCapTP.getKernel();
  globals.setKernelP(kernelP);

  globals.setPing(async (): Promise<void> => {
    const result = await E(kernelP).ping();
    logger.info(result);
  });

  try {
    const controllers = await initializeControllers({
      logger,
      kernel: kernelP,
    });
    globals.setCapletController(controllers.caplet);
  } catch (error) {
    offscreenStream.throw(error as Error).catch(logger.error);
  }

  try {
    await offscreenStream.drain((message) => {
      if (isCapTPNotification(message)) {
        const captpMessage = getCapTPMessage(message);
        backgroundCapTP.dispatch(captpMessage);
      } else {
        throw new Error(`Unexpected message: ${stringify(message)}`);
      }
    });
  } catch (error) {
    const finalError = new Error('Offscreen connection closed unexpectedly', {
      cause: error,
    });
    backgroundCapTP.abort(finalError);
    throw finalError;
  }
}

type GlobalSetters = {
  setKernelP: (value: Promise<KernelFacade>) => void;
  setPing: (value: () => Promise<void>) => void;
  setCapletController: (value: CapletControllerFacet) => void;
};

/**
 * Define globals accessible via the background console.
 *
 * @returns A device for setting the global values.
 */
function defineGlobals(): GlobalSetters {
  Object.defineProperty(globalThis, 'E', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: E,
  });

  Object.defineProperty(globalThis, 'omnium', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: {},
  });

  let kernelP: Promise<KernelFacade>;
  let ping: (() => Promise<void>) | undefined;
  let capletController: CapletControllerFacet;

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
    ping: {
      get: () => ping,
    },
    getKernel: {
      value: async () => kernelP,
    },
    caplet: {
      value: harden({
        install: async (manifest: CapletManifest) =>
          E(capletController).install(manifest),
        uninstall: async (capletId: string) =>
          E(capletController).uninstall(capletId),
        list: async () => E(capletController).list(),
        load: loadCaplet,
        get: async (capletId: string) => E(capletController).get(capletId),
        getCapletRoot: async (capletId: string) =>
          E(capletController).getCapletRoot(capletId),
      }),
    },
  });
  harden(globalThis.omnium);

  return {
    setKernelP: (value) => {
      kernelP = value;
    },
    setPing: (value) => {
      ping = value;
    },
    setCapletController: (value) => {
      capletController = value;
    },
  };
}
