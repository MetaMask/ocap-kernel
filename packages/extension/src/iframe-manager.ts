import { makeCapTP } from '@endo/captp';
import { E } from '@endo/eventual-send';
import type { PromiseKit } from '@endo/promise-kit';
import { makePromiseKit } from '@endo/promise-kit';
import { createWindow } from '@metamask/snaps-utils';
import type { StreamPair, Reader } from '@ocap/streams';
import {
  initializeMessageChannel,
  makeMessagePortStreamPair,
} from '@ocap/streams';

import type { StreamEnvelope, StreamEnvelopeHandler } from './envelope.js';
import {
  makeStreamEnvelopeHandler,
  wrapCapTp,
  wrapCommand,
} from './envelope.js';
import type {
  CapTpMessage,
  CapTpPayload,
  IframeMessage,
  MessageId,
} from './message.js';
import { Command } from './message.js';
import { makeCounter, type VatId } from './shared.js';

const IFRAME_URI = 'iframe.html';

/**
 * Get a DOM id for our iframes, for greater collision resistance.
 *
 * @param id - The vat id to base the DOM id on.
 * @returns The DOM id.
 */
const getHtmlId = (id: VatId): string => `ocap-iframe-${id}`;

type PromiseCallbacks = Omit<PromiseKit<unknown>, 'promise'>;

type UnresolvedMessages = Map<MessageId, PromiseCallbacks>;

type GetPort = (targetWindow: Window) => Promise<MessagePort>;

type VatRecord = {
  streams: StreamPair<StreamEnvelope>;
  messageCounter: () => number;
  unresolvedMessages: UnresolvedMessages;
  streamEnvelopeHandler: StreamEnvelopeHandler;
  capTp?: ReturnType<typeof makeCapTP>;
};

/**
 * A singleton class to manage and message iframes.
 */
export class IframeManager {
  readonly #vats: Map<VatId, VatRecord>;

  readonly #vatIdCounter: () => number;

  /**
   * Create a new IframeManager.
   */
  constructor() {
    this.#vats = new Map();
    this.#vatIdCounter = makeCounter();
  }

  /**
   * Create a new vat, in the form of an iframe.
   *
   * @param args - Options bag.
   * @param args.id - The id of the vat to create.
   * @param args.getPort - A function to get the message port for the iframe.
   * @returns The iframe's content window, and the id of the associated vat.
   */
  async create(
    args: { id?: VatId; getPort?: GetPort } = {},
  ): Promise<readonly [Window, VatId]> {
    const vatId = args.id ?? this.#nextVatId();
    const getPort = args.getPort ?? initializeMessageChannel;

    const newWindow = await createWindow(IFRAME_URI, getHtmlId(vatId));
    const port = await getPort(newWindow);
    const streams = makeMessagePortStreamPair<StreamEnvelope>(port);
    const unresolvedMessages = new Map();
    this.#vats.set(vatId, {
      streams,
      messageCounter: makeCounter(),
      unresolvedMessages,
      streamEnvelopeHandler: makeStreamEnvelopeHandler(
        {
          command: async ({ id, message }) => {
            const promiseCallbacks = unresolvedMessages.get(id);
            if (promiseCallbacks === undefined) {
              console.error(`No unresolved message with id "${id}".`);
            } else {
              unresolvedMessages.delete(id);
              promiseCallbacks.resolve(message.data);
            }
          },
        },
        console.warn,
      ),
    });
    /* v8 ignore next 4: Not known to be possible. */
    this.#receiveMessages(vatId, streams.reader).catch((error) => {
      console.error(`Unexpected read error from vat "${vatId}"`, error);
      this.delete(vatId).catch(() => undefined);
    });

    await this.sendMessage(vatId, { type: Command.Ping, data: null });
    console.debug(`Created vat with id "${vatId}"`);
    return [newWindow, vatId] as const;
  }

  /**
   * Delete a vat and its associated iframe.
   *
   * @param id - The id of the vat to delete.
   * @returns A promise that resolves when the iframe is deleted.
   */
  async delete(id: VatId): Promise<void> {
    const vat = this.#vats.get(id);
    if (vat === undefined) {
      return undefined;
    }

    const closeP = vat.streams.return();

    // Handle orphaned messages
    for (const [messageId, promiseCallback] of vat.unresolvedMessages) {
      promiseCallback?.reject(new Error('Vat was deleted'));
      vat.unresolvedMessages.delete(messageId);
    }
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
   * Send a message to a vat.
   *
   * @param id - The id of the vat to send the message to.
   * @param message - The message to send.
   * @returns A promise that resolves the response to the message.
   */
  async sendMessage(id: VatId, message: IframeMessage): Promise<unknown> {
    const vat = this.#expectGetVat(id);
    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextMessageId(id);

    vat.unresolvedMessages.set(messageId, { reject, resolve });
    await vat.streams.writer.next(wrapCommand({ id: messageId, message }));
    return promise;
  }

  async callCapTp(id: VatId, payload: CapTpPayload): Promise<unknown> {
    const { capTp } = this.#expectGetVat(id);
    if (capTp === undefined) {
      throw new Error(`Vat with id "${id}" does not have a CapTP connection.`);
    }
    return E(capTp.getBootstrap())[payload.method](...payload.params);
  }

  async makeCapTp(id: VatId): Promise<unknown> {
    const vat = this.#expectGetVat(id);
    if (vat.capTp !== undefined) {
      throw new Error(`Vat with id "${id}" already has a CapTP connection.`);
    }

    // Handle writes here. #receiveMessages() handles reads.
    const { writer } = vat.streams;
    // https://github.com/endojs/endo/issues/2412
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const ctp = makeCapTP(id, async (content: unknown) => {
      console.log('CapTP to vat', JSON.stringify(content, null, 2));
      await writer.next(wrapCapTp(content as CapTpMessage));
    });

    vat.capTp = ctp;
    vat.streamEnvelopeHandler = makeStreamEnvelopeHandler(
      {
        ...vat.streamEnvelopeHandler.contentHandlers,
        capTp: async (content) => {
          console.log('CapTP from vat', JSON.stringify(content, null, 2));
          ctp.dispatch(content);
        },
      },
      vat.streamEnvelopeHandler.errorHandler,
    );

    return this.sendMessage(id, { type: Command.CapTpInit, data: null });
  }

  async #receiveMessages(
    vatId: VatId,
    reader: Reader<StreamEnvelope>,
  ): Promise<void> {
    const vat = this.#expectGetVat(vatId);

    for await (const rawMessage of reader) {
      console.debug('Offscreen received message', rawMessage);
      await vat.streamEnvelopeHandler.handle(rawMessage);
    }
  }

  /**
   * Get a vat record by id, or throw an error if it doesn't exist.
   *
   * @param id - The id of the vat to get.
   * @returns The vat record.
   */
  #expectGetVat(id: VatId): VatRecord {
    const vat = this.#vats.get(id);
    if (vat === undefined) {
      throw new Error(`No vat with id "${id}"`);
    }
    return vat;
  }

  readonly #nextMessageId = (id: VatId): MessageId => {
    return `${id}-${this.#expectGetVat(id).messageCounter()}`;
  };

  readonly #nextVatId = (): MessageId => {
    return `${this.#vatIdCounter()}`;
  };
}
