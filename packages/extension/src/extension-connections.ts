import type { Connection, ReaderMessage, WriterMessage } from '@ocap/streams';

import type { CommandMessage } from './message.js';
import { ExtensionMessageTarget } from './message.js';

// Abstract extension connection.

type Target<Interlocutor extends ExtensionMessageTarget> =
  Interlocutor extends ExtensionMessageTarget.Background
    ? ExtensionMessageTarget.Offscreen
    : Interlocutor extends ExtensionMessageTarget.Offscreen
    ? ExtensionMessageTarget.Background
    : never;

// Provides a switch for when we differentiate Command/CommandReply types
type Mode<Interlocutor extends ExtensionMessageTarget> =
  Interlocutor extends ExtensionMessageTarget.Background
    ? CommandMessage<Target<Interlocutor>>
    : Interlocutor extends ExtensionMessageTarget.Offscreen
    ? CommandMessage<Target<Interlocutor>>
    : never;

// Use chrome's extension API to send messages between the
// background service worker and its offscreen document.
const makeMakeExtensionConnection =
  <Interlocutor extends ExtensionMessageTarget>(
    interlocutor: Interlocutor,
    open: () => Promise<void> = async () => undefined,
  ): (() => Connection<
    ReaderMessage<Mode<Target<Interlocutor>>>,
    WriterMessage<Mode<Interlocutor>>
  >) =>
  () => ({
    open,
    sendMessage: async (message: WriterMessage<Mode<Interlocutor>>) => {
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
      handler: (message: ReaderMessage<Mode<Target<Interlocutor>>>) => void,
    ) =>
      chrome.runtime.onMessage.addListener(
        (message: ReaderMessage<Mode<Target<Interlocutor>>>) =>
          handler(message),
      ),
    close: async () => undefined,
  });

// Extension connection implementations.

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
