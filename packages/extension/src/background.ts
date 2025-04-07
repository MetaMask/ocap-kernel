import type { Json } from '@metamask/utils';
import { KernelCommandMethod, isKernelCommandReply } from '@ocap/kernel';
import type { KernelCommand } from '@ocap/kernel';
import { ChromeRuntimeDuplexStream } from '@ocap/streams/browser';
import { delay, makeLogger } from '@ocap/utils';

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

const logger = makeLogger('[background]');

main().catch(logger.error);

/**
 * The main function for the background script.
 */
async function main(): Promise<void> {
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
    justification: `Surely you won't object to our capabilities?`,
  });

  // Without this delay, sending messages via the chrome.runtime API can fail.
  await delay(50);

  const offscreenStream = await ChromeRuntimeDuplexStream.make(
    chrome.runtime,
    'background',
    'offscreen',
  );

  /**
   * Send a command to the offscreen document.
   *
   * @param command - The command to send.
   */
  const sendClusterCommand = async (command: KernelCommand): Promise<void> => {
    await offscreenStream.write(command);
  };

  // globalThis.kernel will exist due to dev-logger.js in background-trusted-prelude.js
  Object.defineProperties(globalThis.kernel, {
    ping: {
      value: async () =>
        sendClusterCommand({
          method: KernelCommandMethod.ping,
          params: [],
        }),
    },
    sendMessage: {
      value: async (message: Json) => await offscreenStream.write(message),
    },
  });
  harden(globalThis.kernel);

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    sendClusterCommand({
      method: KernelCommandMethod.ping,
      params: [],
    }).catch(logger.error);
  });

  // Handle replies from the offscreen document
  for await (const message of offscreenStream) {
    if (!isKernelCommandReply(message)) {
      logger.error('Background received unexpected message', message);
      continue;
    }

    switch (message.method) {
      case KernelCommandMethod.ping:
        logger.log(message.params);
        break;
      default:
        logger.error(
          // @ts-expect-error Compile-time exhaustiveness check
          `Background received unexpected command method: "${message.method.valueOf()}"`,
        );
    }
  }

  throw new Error('Offscreen connection closed unexpectedly');
}
