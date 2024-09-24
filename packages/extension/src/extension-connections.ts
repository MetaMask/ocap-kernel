import { isObject, type Json } from '@metamask/utils';
import type { Connection, ReaderMessage, WriterMessage } from '@ocap/streams';
import { isCommand, type Command, type CommandReply } from '@ocap/utils';

// Extension types.

export enum ExtensionMessageTarget {
  Background = 'background',
  Offscreen = 'offscreen',
}

export type ExtensionRuntimeMessage = {
  payload: Command;
  target: ExtensionMessageTarget;
};

export const isExtensionRuntimeMessage = (
  message: unknown,
): message is ExtensionRuntimeMessage =>
  isObject(message) &&
  typeof message.target === 'string' &&
  Object.values(ExtensionMessageTarget).includes(
    message.target as ExtensionMessageTarget,
  ) &&
  isCommand(message.payload);

export type TargetedAt<Target extends ExtensionMessageTarget> = {
  target: Target;
};

type SwapTarget<Target extends ExtensionMessageTarget> =
  Target extends ExtensionMessageTarget.Background
    ? ExtensionMessageTarget.Offscreen
    : Target extends ExtensionMessageTarget.Offscreen
    ? ExtensionMessageTarget.Background
    : never;

// Abstract extension connection.

// Use chrome's extension API to send messages between the
// background service worker and its offscreen document.
const makeMakeExtensionConnection =
  <
    Read,
    Write = Read,
    Self extends ExtensionMessageTarget = ExtensionMessageTarget,
  >(
    other: SwapTarget<Self>,
    open: () => Promise<void> = async () => undefined,
  ): (() => Connection<ReaderMessage<Read>, WriterMessage<Write>>) =>
  () => ({
    open,
    sendMessage: async (message: WriterMessage<Write>) => {
      if (message instanceof Error) {
        throw new Error(`Attempt to send Error as message.`, {
          cause: message,
        });
      }
      await open();
      await chrome.runtime.sendMessage({
        target: other,
        type: 'command',
        data: message,
      });
    },
    setMessageHandler: (handler: (message: ReaderMessage<Read>) => void) =>
      chrome.runtime.onMessage.addListener(
        (message: ReaderMessage<Read & TargetedAt<Self>>) => handler(message),
      ),
    close: async () => undefined,
  });

// Extension connection implementations.

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

export const makeBackgroundOffscreenConnection = makeMakeExtensionConnection<
  CommandReply,
  Command
>(ExtensionMessageTarget.Offscreen, async () => {
  // Create the offscreen document if it doesn't exist.
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
      justification: `Surely you won't object to our capabilities?`,
    });
  }
});

export const makeOffscreenBackgroundConnection = makeMakeExtensionConnection<
  Command,
  CommandReply
>(ExtensionMessageTarget.Background);

// A utility for the dev-console to send messages directly to the offscreen.
export const sendMessageToOffscreen = async (
  type: string,
  data?: Json,
): Promise<void> =>
  chrome.runtime.sendMessage({
    target: ExtensionMessageTarget.Offscreen,
    payload: {
      data: data ?? null,
      type,
    },
  });
