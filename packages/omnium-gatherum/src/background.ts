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
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { ChromeRuntimeDuplexStream } from '@metamask/streams/browser';

import {
  CapletController,
  makeChromeStorageAdapter,
} from './controllers/index.ts';
import type {
  CapletControllerFacet,
  CapletManifest,
  LaunchResult,
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

  // Create storage adapter
  const storageAdapter = makeChromeStorageAdapter();

  // Create CapletController with attenuated kernel access
  // Controller creates its own storage internally
  const capletController = await CapletController.make(
    { logger: logger.subLogger({ tags: ['caplet'] }) },
    {
      adapter: storageAdapter,
      // Wrap launchSubcluster to return subclusterId
      launchSubcluster: async (
        config: ClusterConfig,
      ): Promise<LaunchResult> => {
        // Get current subcluster count
        const statusBefore = await E(kernelP).getStatus();
        const beforeIds = new Set(
          statusBefore.subclusters.map((subcluster) => subcluster.id),
        );

        // Launch the subcluster
        await E(kernelP).launchSubcluster(config);

        // Get status after and find the new subcluster
        const statusAfter = await E(kernelP).getStatus();
        const newSubcluster = statusAfter.subclusters.find(
          (subcluster) => !beforeIds.has(subcluster.id),
        );

        if (!newSubcluster) {
          throw new Error('Failed to determine subclusterId after launch');
        }

        return { subclusterId: newSubcluster.id };
      },
      terminateSubcluster: async (subclusterId: string): Promise<void> => {
        await E(kernelP).terminateSubcluster(subclusterId);
      },
    },
  );
  globals.setCapletController(capletController);

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

  Object.defineProperties(globalThis.omnium, {
    ping: {
      get: () => ping,
    },
    getKernel: {
      value: async () => kernelP,
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
