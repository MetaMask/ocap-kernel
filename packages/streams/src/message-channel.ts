/**
 * This module establishes a simple protocol for creating a MessageChannel between two
 * realms, as follows:
 * 1. The sending realm asserts that the receiving realm is ready to receive messages,
 * either by creating the realm itself (for example, by appending an iframe to the DOM),
 * or via some other means.
 * 2. The receiving realm calls `receiveMessagePort()` on startup in one of its scripts.
 * The script element in question should not have the `async` attribute.
 * 3. The sending realm calls `initializeMessageChannel()` which sends a message port to
 * the receiving realm. When the returned promise resolves, the sending realm and the
 * receiving realm have established a message channel.
 *
 * @module MessageChannel utilities
 */

import { makePromiseKit } from '@endo/promise-kit';
import { isObject } from '@metamask/utils';
import { stringify } from '@ocap/utils';

export enum MessageType {
  Initialize = 'INIT_MESSAGE_CHANNEL',
  Acknowledge = 'ACK_MESSAGE_CHANNEL',
}

type InitializeMessage = { type: MessageType.Initialize };
type AcknowledgeMessage = { type: MessageType.Acknowledge };

const isInitMessage = (
  event: MessageEvent,
): event is MessageEvent<InitializeMessage> =>
  isObject(event.data) &&
  event.data.type === MessageType.Initialize &&
  Array.isArray(event.ports) &&
  event.ports.length === 1 &&
  event.ports[0] instanceof MessagePort;

const isAckMessage = (value: unknown): value is AcknowledgeMessage =>
  isObject(value) && value.type === MessageType.Acknowledge;

/**
 * Creates a message channel and sends one of the ports to the receiving realm. The
 * realm must be loaded, and it must have called {@link receiveMessagePort} to
 * receive the remote message port. Rejects if the first message received over the
 * channel is not an {@link AcknowledgeMessage}.
 *
 * @param postMessage - A bound method for posting a message to the receiving realm.
 * Must be able to transfer a message port.
 * @returns A promise that resolves with the local message port, once the receiving
 * realm has acknowledged its receipt of the remote port.
 */
export async function initializeMessageChannel(
  postMessage: (message: unknown, transfer: Transferable[]) => void,
): Promise<MessagePort> {
  const { port1, port2 } = new MessageChannel();

  const { promise, resolve, reject } = makePromiseKit<MessagePort>();
  // Assigning to the `onmessage` property initializes the port's message queue.
  port1.onmessage = (message: MessageEvent): void => {
    if (!isAckMessage(message.data)) {
      reject(
        new Error(
          `Received unexpected message via message port:\n${stringify(
            message.data,
          )}`,
        ),
      );
      return;
    }

    resolve(port1);
  };

  const initMessage: InitializeMessage = {
    type: MessageType.Initialize,
  };
  postMessage(initMessage, [port2]);

  return promise
    .catch((error) => {
      port1.close();
      throw error;
    })
    .finally(() => (port1.onmessage = null));
}

type Listener = (message: MessageEvent) => void;

/**
 * Receives a message port from the sending realm, and sends an {@link AcknowledgeMessage}
 * over the port. Should be called in a script _without_ the `async` attribute on startup.
 * The sending realm must call {@link initializeMessageChannel} to send the message port
 * after this realm has loaded. Ignores any message events dispatched on the local
 * realm that are not an {@link InitializeMessage}.
 *
 * @param addListener - A bound method to add a message event listener to the sending realm.
 * @param removeListener - A bound method to remove a message event listener from the sending realm.
 * @returns A promise that resolves with a message port that can be used to communicate
 * with the sending realm.
 */
export async function receiveMessagePort(
  addListener: (listener: Listener) => void,
  removeListener: (listener: Listener) => void,
): Promise<MessagePort> {
  const { promise, resolve } = makePromiseKit<MessagePort>();

  const listener = (message: MessageEvent): void => {
    if (!isInitMessage(message)) {
      return;
    }
    removeListener(listener);

    const port = message.ports[0] as MessagePort;
    const ackMessage: AcknowledgeMessage = { type: MessageType.Acknowledge };
    port.postMessage(ackMessage);
    resolve(port);
  };

  addListener(listener);
  return promise;
}
