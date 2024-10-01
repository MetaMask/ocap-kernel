import './background-trusted-prelude.js';
import type { Json } from '@metamask/utils';
import { CommandMethod, isCommandReply } from '@ocap/kernel';
import type { Command, CommandFunction } from '@ocap/kernel';
import {
  ChromeRuntimeTarget,
  makeChromeRuntimeStreamPair,
} from '@ocap/streams';

main().catch(console.error);

/**
 * The main function for the background script.
 */
async function main(): Promise<void> {
  const offscreenStreams = makeChromeRuntimeStreamPair(
    chrome.runtime,
    ChromeRuntimeTarget.Background,
    ChromeRuntimeTarget.Offscreen,
  );

  /**
   * Send a message to the offscreen document.
   *
   * @param method - The message type.
   * @param params - The message data.
   * @param params.name - The name to include in the message.
   */
  const sendCommand: CommandFunction<Promise<void>> = async (
    method: CommandMethod,
    params?: Command['params'],
  ) => {
    await provideOffScreenDocument();

    await offscreenStreams.writer.next({
      method,
      params: params ?? null,
    });
  };

  // globalThis.kernel will exist due to dev-console.js in background-trusted-prelude.js
  Object.defineProperties(globalThis.kernel, {
    capTpCall: {
      value: async (method: string, params: Json[]) =>
        sendCommand(CommandMethod.CapTpCall, { method, params }),
    },
    capTpInit: {
      value: async () => sendCommand(CommandMethod.CapTpInit),
    },
    evaluate: {
      value: async (source: string) =>
        sendCommand(CommandMethod.Evaluate, source),
    },
    ping: {
      value: async () => sendCommand(CommandMethod.Ping),
    },
    sendMessage: {
      value: sendCommand,
    },
    kvGet: {
      value: async (key: string) => sendCommand(CommandMethod.KVGet, key),
    },
    kvSet: {
      value: async (key: string, value: string) =>
        sendCommand(CommandMethod.KVSet, { key, value }),
    },
  });
  harden(globalThis.kernel);

  const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

  // With this we can click the extension action button to wake up the service worker.
  chrome.action.onClicked.addListener(() => {
    sendCommand(CommandMethod.Ping).catch(console.error);
  });

  /**
   * Create the offscreen document if it doesn't already exist.
   */
  async function provideOffScreenDocument(): Promise<void> {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
        justification: `Surely you won't object to our capabilities?`,
      });
    }
  }

  // Handle replies from the offscreen document
  for await (const message of offscreenStreams.reader) {
    if (!isCommandReply(message)) {
      console.error('Background received unexpected message', message);
      continue;
    }

    switch (message.method) {
      case CommandMethod.Evaluate:
      case CommandMethod.CapTpCall:
      case CommandMethod.CapTpInit:
      case CommandMethod.Ping:
      case CommandMethod.KVGet:
      case CommandMethod.KVSet:
        console.log(message.params);
        break;
      default:
        console.error(
          // @ts-expect-error Runtime does not respect "never".
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Background received unexpected command method: "${payload.method}"`,
        );
    }
  }

  throw new Error('Offscreen connection closed unexpectedly');
}
