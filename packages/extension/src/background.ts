import './background-trusted-prelude.js';
import type { Json } from '@metamask/utils';
import { ClusterCommandMethod, isClusterCommandReply } from '@ocap/kernel';
import type { ClusterCommand, ClusterCommandFunction } from '@ocap/kernel';
import { ChromeRuntimeTarget, ChromeRuntimeDuplexStream } from '@ocap/streams';

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

main().catch(console.error);

/**
 * The main function for the background script.
 */
async function main(): Promise<void> {
  const offscreenStream = new ChromeRuntimeDuplexStream(
    chrome.runtime,
    ChromeRuntimeTarget.Background,
    ChromeRuntimeTarget.Offscreen,
  );

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
    justification: `Surely you won't object to our capabilities?`,
  });

  /**
   * Send a message to the offscreen document.
   *
   * @param method - The message type.
   * @param params - The message data.
   * @param params.name - The name to include in the message.
   */
  const sendClusterCommand: ClusterCommandFunction<Promise<void>> = async (
    method: ClusterCommand['method'],
    params?: ClusterCommand['params'],
  ) => {
    await offscreenStream.write({
      method,
      params: params ?? null,
    });
  };

  // globalThis.kernel will exist due to dev-console.js in background-trusted-prelude.js
  Object.defineProperties(globalThis.kernel, {
    capTpCall: {
      value: async (method: string, params: Json[]) =>
        sendClusterCommand(ClusterCommandMethod.CapTpCall, { method, params }),
    },
    evaluate: {
      value: async (source: string) =>
        sendClusterCommand(ClusterCommandMethod.Evaluate, source),
    },
    ping: {
      value: async () => sendClusterCommand(ClusterCommandMethod.Ping),
    },
    sendMessage: {
      value: sendClusterCommand,
    },
    kvGet: {
      value: async (key: string) =>
        sendClusterCommand(ClusterCommandMethod.KVGet, key),
    },
    kvSet: {
      value: async (key: string, value: string) =>
        sendClusterCommand(ClusterCommandMethod.KVSet, { key, value }),
    },
  });
  harden(globalThis.kernel);

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    sendClusterCommand(ClusterCommandMethod.Ping).catch(console.error);
  });

  // Handle replies from the offscreen document
  for await (const message of offscreenStream) {
    if (!isClusterCommandReply(message)) {
      console.error('Background received unexpected message', message);
      continue;
    }

    switch (message.method) {
      case ClusterCommandMethod.InitKernel:
      case ClusterCommandMethod.Evaluate:
      case ClusterCommandMethod.CapTpCall:
      case ClusterCommandMethod.Ping:
      case ClusterCommandMethod.KVGet:
      case ClusterCommandMethod.KVSet:
        console.log(message.params);
        break;
      default:
        console.error(
          // @ts-expect-error Runtime does not respect "never".
          `Background received unexpected command method: "${payload.method}"`,
        );
    }
  }

  throw new Error('Offscreen connection closed unexpectedly');
}
