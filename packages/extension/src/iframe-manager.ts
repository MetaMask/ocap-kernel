import type { PromiseKit } from '@endo/promise-kit';
import { makePromiseKit } from '@endo/promise-kit';
import { createWindow } from '@metamask/snaps-utils';

import type { IframeMessage } from './shared';
import { Command, isWrappedIframeMessage } from './shared';

const URI = 'iframe.html';

// The actual <iframe> id, for greater collision resistance.
const getHtmlId = (id: string) => `ocap-iframe-${id}`;

type PromiseCallbacks = Omit<PromiseKit<unknown>, 'promise'>;

export class IframeManager {
  #currentId: number;

  #unresolvedMessages: Map<string, PromiseCallbacks>;

  #iframes: Map<string, Window>;

  /**
   * Create a new IframeManager.
   */
  constructor() {
    this.#currentId = 0;
    this.#iframes = new Map();
    this.#unresolvedMessages = new Map();

    window.addEventListener('message', (event: MessageEvent) =>
      this.#handleMessage(event),
    );
  }

  /**
   * Create a new iframe.
   * @param id - The id of the iframe to create.
   * @returns The iframe's content window, and its id.
   */
  async create(id?: string): Promise<readonly [Window, string]> {
    const actualId = id === undefined ? this.#nextId() : id;
    const newWindow = await createWindow(URI, getHtmlId(actualId));
    this.#iframes.set(actualId, newWindow);
    await this.sendMessage(actualId, { type: Command.Ping, data: null });
    console.debug(`Created iframe with id "${actualId}"`);
    return [newWindow, actualId] as const;
  }

  /**
   * Delete an iframe.
   * @param id - The id of the iframe to delete.
   */
  delete(id: string) {
    // TODO: Handle orphaned messages
    document.getElementById(getHtmlId(id))?.remove();
    this.#iframes.delete(id);
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
    const iframeWindow = this.#get(id);
    if (iframeWindow === undefined) {
      throw new Error(`No iframe with id ${id}`);
    }

    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextId();
    this.#unresolvedMessages.set(messageId, { reject, resolve });
    iframeWindow.postMessage({ id: messageId, message }, '*');
    return promise;
  }

  #handleMessage(event: MessageEvent) {
    console.debug('Offscreen received message', event);

    if (!isWrappedIframeMessage(event.data)) {
      console.warn(
        'Offscreen received message with unexpected format',
        event.data,
      );
      return;
    }

    const { id, message } = event.data;
    const promiseCallbacks = this.#unresolvedMessages.get(id);
    if (promiseCallbacks === undefined) {
      console.error(`No unresolved message with id "${id}".`);
      return;
    }

    promiseCallbacks.resolve(message.data);
  }

  #nextId() {
    const id = this.#currentId;
    this.#currentId += 1;
    return String(id);
  }

  #get(id: string) {
    return this.#iframes.get(id);
  }
}
