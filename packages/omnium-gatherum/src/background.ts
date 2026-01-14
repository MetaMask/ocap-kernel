import { E } from '@endo/eventual-send';
import {
  makeBackgroundCapTP,
  makePresenceManager,
  makeCapTPNotification,
  isCapTPNotification,
  getCapTPMessage,
} from '@metamask/kernel-browser-runtime';
import type { CapTPMessage } from '@metamask/kernel-browser-runtime';
import { delay, isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { ChromeRuntimeDuplexStream } from '@metamask/streams/browser';

import {
  CapletController,
  makeChromeStorageAdapter,
} from './controllers/index.ts';
import type { CapletManifest, LaunchResult } from './controllers/index.ts';

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

  // Create presence manager for E() on vat objects
  const presenceManager = makePresenceManager({ kernelFacade: kernelP });

  // Create storage adapter
  const storageAdapter = makeChromeStorageAdapter();

  // Create CapletController with attenuated kernel access
  // Controller creates its own storage internally
  const capletController = await CapletController.make(
    { logger: logger.subLogger({ tags: ['caplet'] }) },
    {
      adapter: storageAdapter,
      launchSubcluster: async (
        config: ClusterConfig,
      ): Promise<LaunchResult> => {
        const result = await E(kernelP).launchSubcluster(config);
        return {
          subclusterId: result.subclusterId,
          rootKref: result.rootKref,
        };
      },
      terminateSubcluster: async (subclusterId: string): Promise<void> => {
        await E(kernelP).terminateSubcluster(subclusterId);
      },
      getVatRoot: async (krefString: string): Promise<unknown> => {
        // Convert kref string to presence via kernel facade
        return E(kernelP).getVatRoot(krefString);
      },
    },
  );

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

    // Fetch manifest
    const manifestUrl = `${baseUrl}${id}.manifest.json`;
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) {
      throw new Error(`Failed to fetch manifest for caplet "${id}"`);
    }
    const manifestData = (await manifestResponse.json()) as Omit<
      CapletManifest,
      'bundleSpec'
    >;

    // Construct full manifest with bundleSpec
    const bundleSpec = `${baseUrl}${id}-caplet.bundle`;
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
    loadCaplet: {
      value: loadCaplet,
    },
    caplet: {
      value: harden({
        install: async (manifest: CapletManifest, bundle?: unknown) =>
          E(capletController).install(manifest, bundle),
        uninstall: async (capletId: string) =>
          E(capletController).uninstall(capletId),
        list: async () => E(capletController).list(),
        get: async (capletId: string) => E(capletController).get(capletId),
        getByService: async (serviceName: string) =>
          E(capletController).getByService(serviceName),
        getCapletRoot: async (capletId: string) =>
          E(capletController).getCapletRoot(capletId),
      }),
    },
    resolveKref: {
      value: presenceManager.resolveKref,
    },
    krefOf: {
      value: presenceManager.krefOf,
    },
  });
  harden(globalThis.omnium);

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    E(kernelP).ping().catch(logger.error);
  });

  try {
    // Handle incoming CapTP messages from the kernel
    await offscreenStream.drain((message) => {
      if (isCapTPNotification(message)) {
        const captpMessage = getCapTPMessage(message);
        backgroundCapTP.dispatch(captpMessage);
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
