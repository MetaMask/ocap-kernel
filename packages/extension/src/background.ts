import type { Json } from '@metamask/utils';

import './background-trusted-prelude.js';
import { makeBackgroundOffscreenStreamPair } from './extension-stream-pairs.js';
import type { CommandMessage } from './message.js';
import { Command } from './message.js';

const streams = makeBackgroundOffscreenStreamPair();

// globalThis.kernel will exist due to dev-console.js in background-trusted-prelude.js
Object.defineProperties(globalThis.kernel, {
  capTpCall: {
    value: async (method: string, params: Json[]) =>
      await streams.writer.next({
        type: Command.CapTpCall,
        data: { method, params },
      }),
  },
  capTpInit: {
    value: async () =>
      await streams.writer.next({ type: Command.CapTpInit, data: null }),
  },
  evaluate: {
    value: async (source: string) =>
      await streams.writer.next({ type: Command.Evaluate, data: source }),
  },
  ping: {
    value: async () =>
      await streams.writer.next({ type: Command.Ping, data: null }),
  },
  sendMessage: {
    value: async (message: CommandMessage<never>) =>
      await streams.writer.next(message),
  },
});
harden(globalThis.kernel);

// With this we can click the extension action button to wake up the service worker.
chrome.action.onClicked.addListener(() => {
  streams.writer.next({ type: Command.Ping, data: null }).catch(console.error);
});

// This is the correct way to start the async stream reader.
// eslint-disable-next-line @typescript-eslint/no-floating-promises
handleMessages();

/**
 * Listen to messages from offscreen over the stream.
 */
async function handleMessages(): Promise<void> {
  for await (const message of streams.reader) {
    switch (message.type) {
      case Command.Evaluate:
      case Command.CapTpCall:
      case Command.CapTpInit:
      case Command.Ping:
        console.log(message.data);
        break;
      default:
        console.error(
          // @ts-expect-error The type of `message` is `never`, but this could happen at runtime.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Background received unexpected message type: "${message.type}"`,
        );
    }
  }
}
