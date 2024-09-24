import type { Json } from '@metamask/utils';
import './background-trusted-prelude.js';
import type { Command } from '@ocap/utils';
import { CommandMethod } from '@ocap/utils';

import { sendMessageToOffscreen } from './extension-connections.js';
import { makeBackgroundOffscreenStreamPair } from './extension-stream-pairs.js';

const streams = makeBackgroundOffscreenStreamPair();

// globalThis.kernel will exist due to dev-console.js in background-trusted-prelude.js
Object.defineProperties(globalThis.kernel, {
  // Known commands have their method names mapped to methods
  // taking their params property types as params, omitted if null.
  // TODO: type it so.
  capTpCall: {
    value: async (method: string, params: Json[]) =>
      sendCommand({
        method: CommandMethod.CapTpCall,
        params: { method, params },
      }),
  },
  capTpInit: {
    value: async () =>
      sendCommand({ method: CommandMethod.CapTpInit, params: null }),
  },
  evaluate: {
    value: async (source: string) =>
      sendCommand({ method: CommandMethod.Evaluate, params: source }),
  },
  ping: {
    value: async () =>
      sendCommand({ method: CommandMethod.Ping, params: null }),
  },
  // Use this test utility to send an arbitrary message to the offscreen document.
  sendMessage: { value: sendMessageToOffscreen },
});
harden(globalThis.kernel);

// With this we can click the extension action button to wake up the service worker.
chrome.action.onClicked.addListener(() => {
  sendCommand({ method: CommandMethod.Ping, params: null }).catch(
    console.error,
  );
});

/**
 * Send a command to the offscreen document.
 *
 * @param command - The command to send.
 * @param command.type - The command type.
 * @param command.data - The command data.
 */
async function sendCommand(command: Command): Promise<void> {
  await streams.writer.next(command);
}

// This is the correct way to start the async stream reader.
// eslint-disable-next-line @typescript-eslint/no-floating-promises
handleMessages();

/**
 * Listen to messages from offscreen over the stream.
 */
async function handleMessages(): Promise<void> {
  for await (const message of streams.reader) {
    switch (message.method) {
      case CommandMethod.Evaluate:
      case CommandMethod.CapTpCall:
      case CommandMethod.CapTpInit:
      case CommandMethod.Ping:
        console.log(message.params);
        break;
      default:
        console.error(
          // @ts-expect-error The type of `message` is `never`, but this could happen at runtime.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Background received unexpected command method: "${payload.method}"`,
        );
    }
  }
}
