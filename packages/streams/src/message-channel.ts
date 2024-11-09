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
import type { Infer } from '@metamask/superstruct';
import { literal, is, optional, string, object } from '@metamask/superstruct';

export enum MessageType {
  Initialize = 'INIT_MESSAGE_CHANNEL',
  Acknowledge = 'ACK_MESSAGE_CHANNEL',
}

const InitializeMessageStruct = object({
  type: literal(MessageType.Initialize),
  id: optional(string()),
});

const AcknowledgeMessageStruct = object({
  type: literal(MessageType.Acknowledge),
  id: optional(string()),
});

type InitializeMessage = Infer<typeof InitializeMessageStruct>;
type AcknowledgeMessage = Infer<typeof AcknowledgeMessageStruct>;

const hasPort = (
  event: MessageEvent,
): event is MessageEvent<unknown> & { ports: [MessagePort] } =>
  Array.isArray(event.ports) &&
  event.ports.length === 1 &&
  event.ports[0] instanceof MessagePort;

const isInitMessage = (
  event: MessageEvent,
): event is MessageEvent<InitializeMessage> =>
  is(event.data, InitializeMessageStruct) && hasPort(event);

const isAckMessage = (value: unknown): value is AcknowledgeMessage =>
  is(value, AcknowledgeMessageStruct);

type InitializeMessageChannelParams<Result = MessagePort> = {
  /**
   * A bound method for posting a message to the receiving realm.
   * Must be able to transfer a message port.
   */
  postMessage: (message: unknown, transfer: Transferable[]) => void;

  /**
   * A function that receives the local message port and returns a value.
   * Returns the local message port by default.
   */
  portHandler?: (port: MessagePort) => Result;

  /**
   * A unique identifier for the request.
   */
  requestId?: string;
};

/**
 * Creates a message channel and sends one of the ports to the receiving realm. The
 * realm must be loaded, and it must have called {@link receiveMessagePort} to
 * receive the remote message port. Rejects if the first message received over the
 * channel is not an {@link AcknowledgeMessage}.
 *
 * A request id must be specified if used with {@link MessagePortReceiver}, but must
 * **not** be specified if used with {@link receiveMessagePort}.
 *
 * A `portHandler` function can be specified to synchronously perform any work with
 * the local message port before the promise resolves.
 *
 * @param params - Options bag.
 * @param params.postMessage - A bound method for posting a message to the receiving
 * realm. Must be able to transfer a message port.
 * @param params.portHandler - A function that receives the local message port and
 * returns a value. Returns the local message port by default.
 * @param params.requestId - A unique identifier for the request.
 * @returns A promise that resolves with the value returned by `portHandler`.
 */
export async function initializeMessageChannel<Result = MessagePort>({
  postMessage,
  portHandler = (port) => port as Result,
  requestId,
}: InitializeMessageChannelParams<Result>): Promise<Result> {
  const { port1, port2 } = new MessageChannel();

  const { promise, resolve } = makePromiseKit<Result>();
  const listener = (message: MessageEvent): void => {
    if (!isAckMessage(message.data) || message.data.id !== requestId) {
      return;
    }

    port1.removeEventListener('message', listener);
    resolve(portHandler(port1));
  };

  port1.addEventListener('message', listener);
  port1.start();

  const initMessage: InitializeMessage = {
    type: MessageType.Initialize,
    id: requestId,
  };
  postMessage(initMessage, [port2]);

  return await promise;
}

type Listener = (message: MessageEvent) => void;

type ReceiveMessagePortParams<Result = MessagePort> = {
  /**
   * A bound method to add a message event listener to the sending realm.
   */
  addListener: (listener: Listener) => void;

  /**
   * A bound method to remove a message event listener from the sending realm.
   */
  removeListener: (listener: Listener) => void;

  /**
   * A function that receives the message port and returns a value.
   * Returns the message port by default.
   */
  portHandler?: (port: MessagePort) => Result;
};

/**
 * Receives a message port from the sending realm, and sends an {@link AcknowledgeMessage}
 * over the port. Should be called in a script _without_ the `async` attribute on startup.
 * The sending realm must call {@link initializeMessageChannel} to send the message port
 * after this realm has loaded. Ignores any message events dispatched on the local
 * realm that are not an {@link InitializeMessage}, or who specify a request `id`. In
 * other words, the sending side must not specify a request `id` if this function is
 * used.
 *
 * A `portHandler` function can be specified to synchronously perform any work with the
 * received port before the promise resolves.
 *
 * @param params - Options bag.
 * @param params.addListener - A bound method to add a message event listener to the
 * sending realm.
 * @param params.removeListener - A bound method to remove a message event listener from
 * the sending realm.
 * @param params.portHandler - A function that receives the message port and returns a
 * value. Returns the message port by default.
 * @returns A promise that resolves with the value returned by `portHandler`.
 */
export async function receiveMessagePort<Result = MessagePort>({
  addListener,
  removeListener,
  portHandler = (port) => port as Result,
}: ReceiveMessagePortParams<Result>): Promise<Result> {
  const { promise, resolve, reject } = makePromiseKit<Result>();

  const listener = (message: MessageEvent): void => {
    if (!isInitMessage(message)) {
      return;
    }
    removeListener(listener);

    if (message.data.id !== undefined) {
      reject(
        new Error(
          'Received init message with request id. Use MessagePortReceiver instead.',
        ),
      );
      return;
    }

    const port = message.ports[0] as MessagePort;
    const ackMessage: AcknowledgeMessage = {
      type: MessageType.Acknowledge,
    };
    port.postMessage(ackMessage);
    resolve(portHandler(port));
  };

  addListener(listener);
  return promise;
}

type PendingRequest = {
  resolve: (result: MessagePort) => void;
  reject: (error: Error) => void;
};

export class MessagePortReceiver {
  readonly #listener: Listener;

  readonly #pendingRequests: Map<string, PendingRequest>;

  readonly #receivedPorts: Map<string, MessagePort>;

  readonly #removeListener: (listener: Listener) => void;

  constructor(
    addListener: (listener: Listener) => void,
    removeListener: (listener: Listener) => void,
  ) {
    this.#pendingRequests = new Map();
    this.#receivedPorts = new Map();
    this.#listener = this.#handleMessage.bind(this);
    this.#removeListener = removeListener;
    addListener(this.#listener);
  }

  async receivePort(requestId: string): Promise<MessagePort> {
    const receivedPort = this.#receivedPorts.get(requestId);
    if (receivedPort !== undefined) {
      this.#acknowledgePort(receivedPort, requestId);
      this.#receivedPorts.delete(requestId);
      return Promise.resolve(receivedPort);
    }

    return new Promise((resolve, reject) => {
      this.#pendingRequests.set(requestId, { resolve, reject });
    });
  }

  #acknowledgePort(port: MessagePort, requestId: string): void {
    const ackMessage: AcknowledgeMessage = {
      type: MessageType.Acknowledge,
      id: requestId,
    };
    port.postMessage(ackMessage);
  }

  #handleMessage(message: MessageEvent): void {
    if (!isInitMessage(message)) {
      return;
    }

    const { id } = message.data;
    if (id === undefined) {
      console.error('Received init message with undefined request id');
      return;
    }

    const port = message.ports[0] as MessagePort;
    const pending = this.#pendingRequests.get(id);
    if (pending === undefined) {
      this.#receivedPorts.set(id, port);
      return;
    }

    this.#acknowledgePort(port, id);
    pending.resolve(port);
    this.#pendingRequests.delete(id);
  }

  destroy(): void {
    this.#removeListener(this.#listener);
    const error = new Error('MessagePortReceiver destroyed');
    for (const { reject } of this.#pendingRequests.values()) {
      reject(error);
    }
    this.#pendingRequests.clear();
  }
}
