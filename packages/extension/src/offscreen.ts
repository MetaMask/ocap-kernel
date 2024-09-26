import { createWindow } from '@metamask/snaps-utils';
import { initializeMessageChannel, makeMessagePortStreamPair, StreamPair } from '@ocap/streams';
import type { Command, CommandReply } from '@ocap/utils';
import { CommandMethod, isCommand } from '@ocap/utils';

import {
  ExtensionMessageTarget,
  isExtensionRuntimeMessage,
  makeHandledCallback,
} from './shared.js';

const kernelStreams = startKernel({
  uri: 'kernel.html',
  id: 'ocap-kernel'
});

Promise.race([
  receiveMessagesFromKernel(),
  receiveMessagesFromBackground(),
]).catch(console.error).finally();

type StartKernelArgs = {
  uri: string;
  id: string;
}

async function startKernel({ uri, id }: StartKernelArgs): Promise<StreamPair<CommandReply, Command>> {
  console.debug('starting kernel');
  const targetWindow = await createWindow(uri, id);
  const port = await initializeMessageChannel(targetWindow);
  console.debug('kernel connected');
  return makeMessagePortStreamPair(port);
}

/**
 * Listen to messages from the kernel.
 */
async function receiveMessagesFromKernel(): Promise<void> {
  const streams = await kernelStreams;

  for await(const payload of streams.reader) {

    switch (payload.method) {
      case CommandMethod.Evaluate:
      case CommandMethod.CapTpCall:
      case CommandMethod.CapTpInit:
      case CommandMethod.Ping:
        // For now, we only receive command replies,
        // and we simply forward them to the background service worker.
        await chrome.runtime.sendMessage({
          target: ExtensionMessageTarget.Background,
          payload,
        });
        break;
      default:
        console.error(
          // @ts-expect-error The type of `payload` is `never`, but this could happen at runtime.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Offscreen received unexpected command reply method: "${payload.method}"`,
        );
    }
  }
}

/**
 * Listen to messages from the background service worker.
 */
async function receiveMessagesFromBackground(): Promise<void> {
  console.debug('starting background listener');
  chrome.runtime.onMessage.addListener(
    makeHandledCallback(async (message: unknown) => {
      if (!isExtensionRuntimeMessage(message) || !isCommand(message.payload)) {
        console.error('Offscreen received unexpected message', message);
        return;
      }
      if (message.target !== ExtensionMessageTarget.Offscreen) {
        console.error(
          `Offscreen received message with unexpected target: "${message.target}"`,
        );
        return;
      }

      console.debug('offscreen received message', message);

      const streams = await kernelStreams;

      const { payload } = message;

      switch (payload.method) {
        case CommandMethod.Evaluate:
        case CommandMethod.CapTpCall:
        case CommandMethod.CapTpInit:
        case CommandMethod.Ping:
          // For now, we only recieve kernel commands,
          // and we simply forward them to the kernel.
          console.debug('forwarding message to kernel');
          await streams.writer.next(payload);
          break;
        default:
          console.error(
            // @ts-expect-error The type of `payload` is `never`, but this could happen at runtime.
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `Offscreen received unexpected command method: "${payload.method}"`,
          );
      }
    }),
  );
}
