import { makeCapTP } from '@endo/captp';
import { E } from '@endo/eventual-send';
import type { PromiseKit } from '@endo/promise-kit';
import { makePromiseKit } from '@endo/promise-kit';
import { createWindow } from '@metamask/snaps-utils';
import type { Json } from '@metamask/utils';
import type { MessagePortReader, MessagePortStreamPair } from '@ocap/streams';
import {
  initializeMessageChannel,
  makeMessagePortStreamPair,
} from '@ocap/streams';

import type { IframeMessage, StreamPayloadEnvelope } from './shared.js';
import { isStreamPayloadEnvelope, Command } from './shared.js';

const IFRAME_URI = 'iframe.html';

/**
 * Get a DOM id for our iframes, for greater collision resistance.
 * @param id - The id to base the DOM id on.
 * @returns The DOM id.
 */
const getHtmlId = (id: string) => `ocap-iframe-${id}`;

type PromiseCallbacks = Omit<PromiseKit<unknown>, 'promise'>;

type GetPort = (targetWindow: Window) => Promise<MessagePort>;

type VatRecord = {
  streams: MessagePortStreamPair<StreamPayloadEnvelope>;
  capTp?: ReturnType<typeof makeCapTP>;
};

/**
 * A singleton class to manage and message iframes.
 */
export class IframeManager {
  #currentId: number;

  #unresolvedMessages: Map<string, PromiseCallbacks>;

  #vats: Map<string, VatRecord>;

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
    const streams = makeMessagePortStreamPair<StreamPayloadEnvelope>(port);
    this.#vats.set(id, { streams });
    /* v8 ignore next 4: Not known to be possible. */
    this.#receiveMessages(id, streams.reader).catch((error) => {
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
    const vat = this.#vats.get(id);
    if (vat === undefined) {
      return undefined;
    }

    const closeP = vat.streams.return();
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
    const vat = this.#expectGetVat(id);
    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextId();

    this.#unresolvedMessages.set(messageId, { reject, resolve });
    await vat.streams.writer.next({
      label: 'message',
      payload: { id: messageId, message },
    });
    return promise;
  }

  async callCapTp(
    id: string,
    method: string,
    ...params: Json[]
  ): Promise<unknown> {
    const { capTp } = this.#expectGetVat(id);
    if (capTp === undefined) {
      throw new Error(`Vat with id "${id}" does not have a CapTP connection.`);
    }
    // @ts-expect-error The types are unwell.
    return E(capTp.getBootstrap())[method](...params);
  }

  async makeCapTp(id: string) {
    const vat = this.#expectGetVat(id);
    if (vat.capTp !== undefined) {
      throw new Error(`Vat with id "${id}" already has a CapTP connection.`);
    }

    // Handle writes here. #receiveMessages() handles reads.
    const { writer } = vat.streams;
    // https://github.com/endojs/endo/issues/2412
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const ctp = makeCapTP(id, async (payload: unknown) => {
      console.log('CapTP to vat', JSON.stringify(payload, null, 2));
      await writer.next({ label: 'capTp', payload });
    });

    vat.capTp = ctp;
    await this.sendMessage(id, { type: Command.CapTpInit, data: null });
  }

  async #receiveMessages(
    vatId: string,
    reader: MessagePortReader<StreamPayloadEnvelope>,
  ) {
    for await (const rawMessage of reader) {
      console.debug('Offscreen received message', rawMessage);

      if (!isStreamPayloadEnvelope(rawMessage)) {
        console.warn(
          'Offscreen received message with unexpected format',
          rawMessage,
        );
        return;
      }

      switch (rawMessage.label) {
        case 'capTp': {
          console.log(
            'CapTP from vat',
            JSON.stringify(rawMessage.payload, null, 2),
          );
          const { capTp } = this.#expectGetVat(vatId);
          if (capTp !== undefined) {
            capTp.dispatch(rawMessage.payload);
          }
          break;
        }
        case 'message': {
          const { id, message } = rawMessage.payload;
          const promiseCallbacks = this.#unresolvedMessages.get(id);
          if (promiseCallbacks === undefined) {
            console.error(`No unresolved message with id "${id}".`);
          } else {
            promiseCallbacks.resolve(message.data);
          }
          break;
        }
        /* v8 ignore next 3: Exhaustiveness check */
        default:
          // @ts-expect-error Exhaustiveness check
          throw new Error(`Unexpected message label "${rawMessage.label}".`);
      }
    }
  }

  /**
   * Get a vat record by id, or throw an error if it doesn't exist.
   * @param id - The id of the vat to get.
   * @returns The vat record.
   */
  #expectGetVat(id: string): VatRecord {
    const vat = this.#vats.get(id);
    if (vat === undefined) {
      throw new Error(`No vat with id "${id}"`);
    }
    return vat;
  }

  #nextId() {
    const id = this.#currentId;
    this.#currentId += 1;
    return String(id);
  }
}
