/**
 * This module establishes a simple protocol for establishing a MessageChannel between
 * a parent window and its iframe, as follows:
 * 1. The parent window creates an iframe and appends it to the DOM. The iframe must be
 *    loaded and the `contentWindow` property must be accessible.
 * 2. The iframe calls `receiveMessagePort()` on startup in one of its scripts. The script
 *    element in question should not have the `async` attribute.
 * 3. The parent window calls `initializeMessageChannel()` which sends a message port to
 *    the iframe. When the returned promise resolves, the parent window and the iframe have
 *    established a message channel.
 * @module MessageChannel utilities
 */

import { makePromiseKit } from '@endo/promise-kit';
import { isObject } from '@metamask/utils';

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

const stringify = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * Creates a message channel and sends one of the ports to the target window. The iframe
 * associated with the target window must be loaded, and it must have called
 * {@link receiveMessagePort} to receive the remote message port. Rejects if the first
 * message received over the channel is not an {@link AcknowledgeMessage}.
 * @param targetWindow - The iframe window to send the message port to.
 * @returns A promise that resolves with the local message port, once the target window
 * has acknowledged its receipt of the remote port.
 */
export async function initializeMessageChannel(
  targetWindow: Window,
): Promise<MessagePort> {
  const { port1, port2 } = new MessageChannel();

  const { promise, resolve, reject } = makePromiseKit<MessagePort>();
  // Assigning to the `onmessage` property initializes the port's message queue.
  port1.onmessage = (message: MessageEvent) => {
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
  promise.catch(() => port1.close()).finally(() => (port1.onmessage = null));

  const initMessage: InitializeMessage = {
    type: MessageType.Initialize,
  };
  targetWindow.postMessage(initMessage, '*', [port2]);
  return promise;
}

/**
 * Receives a message port from the parent window, and sends an {@link AcknowledgeMessage}
 * over the port. Should be called in a script _without_ the `async` attribute on startup.
 * The parent window must call {@link initializeMessageChannel} to send the message port
 * after this iframe has loaded. Ignores any message events dispatched on the local
 * `window` that are not an {@link InitializeMessage}.
 * @returns A promise that resolves with a message port that can be used to communicate
 * with the parent window.
 */
export async function receiveMessagePort(): Promise<MessagePort> {
  const { promise, resolve } = makePromiseKit<MessagePort>();

  const listener = (message: MessageEvent) => {
    if (!isInitMessage(message)) {
      return;
    }

    const port = message.ports[0] as MessagePort;
    const ackMessage: AcknowledgeMessage = { type: MessageType.Acknowledge };
    port.postMessage(ackMessage);
    resolve(port);
  };

  window.addEventListener('message', listener);
  promise.finally(() => window.removeEventListener('message', listener));
  return promise;
}
