import type { PromiseKit } from '@endo/promise-kit';
import { makePromiseKit } from '@endo/promise-kit';
import { createWindow } from '@metamask/snaps-utils';
import type { MessagePortReader, MessagePortStreams } from '@ocap/streams';
import {
  initializeMessageChannel,
  makeMessagePortStreams,
} from '@ocap/streams';

import type { IframeMessage, WrappedIframeMessage } from './shared.js';
import { Command, isWrappedIframeMessage } from './shared.js';

const IFRAME_URI = 'iframe.html';

/**
 * Get a DOM id for our iframes, for greater collision resistance.
 * @param id - The id to base the DOM id on.
 * @returns The DOM id.
 */
const getHtmlId = (id: string) => `ocap-iframe-${id}`;

type PromiseCallbacks = Omit<PromiseKit<unknown>, 'promise'>;

type GetPort = (targetWindow: Window) => Promise<MessagePort>;

/**
 * A singleton class to manage and message iframes.
 */
export class IframeManager {
  #currentId: number;

  #unresolvedMessages: Map<string, PromiseCallbacks>;

  #vats: Map<string, MessagePortStreams<WrappedIframeMessage>>;

  /**
   * Create a new IframeManager.
   */
  constructor() {
    this.#currentId = 0;
    this.#vats = new Map();
    this.#unresolvedMessages = new Map();
  }

  /**
   * Create a new vat, in the form of an iframe.
   * @param args - Options bag.
   * @param args.id - The id of the vat to create.
   * @param args.getPort - A function to get the message port for the iframe.
   * @returns The iframe's content window, and its internal id.
   */
  async create(
    args: { id?: string; getPort?: GetPort } = {},
  ): Promise<readonly [Window, string]> {
    const id = args.id ?? this.#nextId();
    const getPort = args.getPort ?? initializeMessageChannel;

    const newWindow = await createWindow(IFRAME_URI, getHtmlId(id));
    const port = await getPort(newWindow);
    const streams = makeMessagePortStreams<WrappedIframeMessage>(port);
    this.#vats.set(id, streams);
    /* v8 ignore next 4: Not known to be possible. */
    this.#receiveMessages(streams.reader).catch((error) => {
      console.error(`Unexpected read error from vat "${id}"`, error);
      this.delete(id).catch(() => undefined);
    });

    await this.sendMessage(id, { type: Command.Ping, data: null });
    console.debug(`Created vat with id "${id}"`);
    return [newWindow, id] as const;
  }

  /**
   * Delete an iframe.
   * @param id - The id of the iframe to delete.
   * @returns A promise that resolves when the iframe is deleted.
   */
  async delete(id: string): Promise<void> {
    const streams = this.#vats.get(id);
    if (streams === undefined) {
      return undefined;
    }

    const { reader, writer } = streams;
    const closeP = Promise.all([reader.return(), writer.return()]).then(
      () => undefined,
    );
    // TODO: Handle orphaned messages
    this.#vats.delete(id);

    const iframe = document.getElementById(getHtmlId(id));
    /* v8 ignore next 6: Not known to be possible. */
    if (iframe === null) {
      console.error(`iframe of vat with id "${id}" already removed from DOM`);
      return undefined;
    }
    iframe.remove();

    return closeP;
  }

  /**
   * Send a message to an iframe.
   * @param id - The id of the iframe to send the message to.
   * @param message - The message to send.
   */
  async sendMessage(
    id: string,
    message: IframeMessage<Command, string | null>,
  ) {
    const streams = this.#vats.get(id);
    if (streams === undefined) {
      throw new Error(`No vat with id "${id}"`);
    }

    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextId();
    this.#unresolvedMessages.set(messageId, { reject, resolve });
    await streams.writer.next({ id: messageId, message });
    return promise;
  }

  async #receiveMessages(reader: MessagePortReader<WrappedIframeMessage>) {
    for await (const rawMessage of reader) {
      console.debug('Offscreen received message', rawMessage);

      if (!isWrappedIframeMessage(rawMessage)) {
        console.warn(
          'Offscreen received message with unexpected format',
          rawMessage,
        );
        return;
      }

      const { id, message } = rawMessage;
      const promiseCallbacks = this.#unresolvedMessages.get(id);
      if (promiseCallbacks === undefined) {
        console.error(`No unresolved message with id "${id}".`);
        continue;
      }

      promiseCallbacks.resolve(message.data);
    }
  }

  #nextId() {
    const id = this.#currentId;
    this.#currentId += 1;
    return String(id);
  }
}
