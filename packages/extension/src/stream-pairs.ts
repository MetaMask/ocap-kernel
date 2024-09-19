import type {
  Connection,
  ReaderMessage,
  StreamPair,
  WriterMessage,
} from '@ocap/streams';
import { makeConnectionStreamPair } from '@ocap/streams';

import type { CommandMessage } from './message.js';
import { ExtensionMessageTarget } from './message.js';

type Swap<Interlocutor extends ExtensionMessageTarget> =
  Interlocutor extends ExtensionMessageTarget.Background
    ? ExtensionMessageTarget.Offscreen
    : Interlocutor extends ExtensionMessageTarget.Offscreen
    ? ExtensionMessageTarget.Background
    : never;

// Use chrome's extension API to send messages between the background service worker and its offscreen document.
const makeMakeExtensionConnection =
  <Interlocutor extends ExtensionMessageTarget>(
    interlocutor: Interlocutor,
    open: () => Promise<void> = async () => undefined,
  ): (() => Connection<
    ReaderMessage<CommandMessage<Swap<Interlocutor>>>,
    WriterMessage<CommandMessage<Interlocutor>>
  >) =>
  () => ({
    open,
    sendMessage: async (
      message: WriterMessage<CommandMessage<Interlocutor>>,
    ) => {
      if (message instanceof Error) {
        throw new Error(`Attempt to send Error as message.`, {
          cause: message,
        });
      }
      await open();
      await chrome.runtime.sendMessage({
        target: interlocutor,
        type: 'command',
        data: message,
      });
    },
    setMessageHandler: (
      handler: (
        message: ReaderMessage<CommandMessage<Swap<Interlocutor>>>,
      ) => void,
    ) =>
      chrome.runtime.onMessage.addListener(
        (message: ReaderMessage<CommandMessage<Swap<Interlocutor>>>) =>
          handler(message),
      ),
    close: async () => undefined,
  });

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

export const makeBackgroundOffscreenConnection = makeMakeExtensionConnection(
  ExtensionMessageTarget.Offscreen,
  async () => {
    // Create the offscreen document if it doesn't exist.
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
        justification: `Surely you won't object to our capabilities?`,
      });
    }
  },
);

export const makeOffscreenBackgroundConnection = makeMakeExtensionConnection(
  ExtensionMessageTarget.Background,
);

export const makeBackgroundStreamPair: () => StreamPair<
  CommandMessage<ExtensionMessageTarget.Background>,
  CommandMessage<ExtensionMessageTarget.Offscreen>
> = () => {
  const connection = makeBackgroundOffscreenConnection();
  return makeConnectionStreamPair(connection);
};

export const makeOffscreenStreamPair: () => StreamPair<
  CommandMessage<ExtensionMessageTarget.Offscreen>,
  CommandMessage<ExtensionMessageTarget.Background>
> = () => {
  const connection = makeOffscreenBackgroundConnection();
  return makeConnectionStreamPair(connection);
};
