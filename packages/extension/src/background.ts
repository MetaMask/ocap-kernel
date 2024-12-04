import type { Json } from '@metamask/utils';
import { KernelCommandMethod, isKernelCommandReply } from '@ocap/kernel';
import type { KernelCommand } from '@ocap/kernel';
import { ChromeRuntimeTarget, ChromeRuntimeDuplexStream } from '@ocap/streams';

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

main().catch(console.error);

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
  await new Promise((resolve) => setTimeout(resolve, 50));

  const offscreenStream = await ChromeRuntimeDuplexStream.make(
    chrome.runtime,
    ChromeRuntimeTarget.Background,
    ChromeRuntimeTarget.Offscreen,
  );

  /**
   * Send a command to the offscreen document.
   *
   * @param command - The command to send.
   */
  const sendClusterCommand = async (command: KernelCommand): Promise<void> => {
    await offscreenStream.write(command);
  };

  // globalThis.kernel will exist due to dev-console.js in background-trusted-prelude.js
  Object.defineProperties(globalThis.kernel, {
    ping: {
      value: async () =>
        sendClusterCommand({
          method: KernelCommandMethod.ping,
          params: null,
        }),
    },
    sendMessage: {
      value: async (message: Json) => await offscreenStream.write(message),
    },
    kvGet: {
      value: async (key: string) =>
        sendClusterCommand({
          method: KernelCommandMethod.kvGet,
          params: key,
        }),
    },
    kvSet: {
      value: async (key: string, value: string) =>
        sendClusterCommand({
          method: KernelCommandMethod.kvSet,
          params: { key, value },
        }),
    },
  });
  harden(globalThis.kernel);

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    sendClusterCommand({
      method: KernelCommandMethod.ping,
      params: null,
    }).catch(console.error);
  });

  // Handle replies from the offscreen document
  for await (const message of offscreenStream) {
    if (!isKernelCommandReply(message)) {
      console.error('Background received unexpected message', message);
      continue;
    }

    switch (message.method) {
      case KernelCommandMethod.ping:
      case KernelCommandMethod.kvGet:
      case KernelCommandMethod.kvSet:
        console.log(message.params);
        break;
      default:
        console.error(
          // @ts-expect-error Runtime does not respect "never".
          `Background received unexpected command method: "${message.method}"`,
        );
    }
  }

  throw new Error('Offscreen connection closed unexpectedly');
}
