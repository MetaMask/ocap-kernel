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

import type {
  CapletManifest,
  InstalledCaplet,
  InstallResult,
} from './controllers/index.ts';

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';
const logger = new Logger('background');
const globals = defineGlobals();
let bootPromise: Promise<void> | null = null;

// With this we can click the extension action button to wake up the service worker.
chrome.action.onClicked.addListener(() => {
  globalThis.kernel !== undefined &&
    E(globalThis.kernel).ping().catch(logger.error);
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
  globals.setKernel(kernelP);

  // Set up bootstrap vat initialization (runs concurrently with stream drain)
  E(kernelP)
    .getSystemVatRoot('omnium-bootstrap')
    .then(({ kref }) => {
      globals.setBootstrapKref(kref);
      logger.info('Bootstrap vat initialized');
      return undefined;
    })
    .catch((error) => {
      logger.error('Failed to initialize bootstrap vat:', error);
    });

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
  setKernel: (kernel: KernelFacade | Promise<KernelFacade>) => void;
  setBootstrapKref: (kref: string) => void;
};

/**
 * Define globals accessible via the background console.
 *
 * @returns A device for setting the global values.
 */
function defineGlobals(): GlobalSetters {
  let bootstrapKref: string;

  /**
   * Call a method on the bootstrap vat via queueMessage.
   *
   * @param method - The method name to call.
   * @param args - Arguments to pass to the method.
   * @returns The result from the bootstrap vat.
   */
  const callBootstrap = async <T>(
    method: string,
    args: unknown[] = [],
  ): Promise<T> => {
    if (!kernel) {
      throw new Error('Kernel facade not initialized');
    }
    if (!bootstrapKref) {
      throw new Error('Bootstrap vat not initialized');
    }

    const capData = await E(kernel).queueMessage(bootstrapKref, method, args);
    // CapData body is JSON-stringified; parse it to get the actual value
    // return JSON.parse(capData.body) as T;
    // @ts-expect-error - CapData is not assignable to T
    return capData;
  };

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
          callBootstrap<InstallResult>('installCaplet', [manifest]),
        uninstall: async (capletId: string) =>
          callBootstrap<void>('uninstallCaplet', [capletId]),
        list: async () => callBootstrap<InstalledCaplet[]>('listCaplets'),
        load: loadCaplet,
        get: async (capletId: string) =>
          callBootstrap<InstalledCaplet | undefined>('getCaplet', [capletId]),
        getCapletRoot: async (capletId: string) =>
          callBootstrap<unknown>('getCapletRoot', [capletId]),
      }),
    },
  });
  harden(globalThis.omnium);

  return {
    setKernel: (kernel) => {
      globalThis.kernel = kernel;
    },
    setBootstrapKref: (kref) => {
      bootstrapKref = kref;
    },
  };
}
