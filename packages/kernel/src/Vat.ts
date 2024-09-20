import { makeCapTP } from '@endo/captp';
import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import type {
  StreamPair,
  StreamEnvelope,
  StreamEnvelopeHandler,
  Reader,
  CapTpMessage,
  CapTpPayload,
  VatMessage,
  MessageId,
} from '@ocap/streams';
import {
  wrapCapTp,
  wrapStreamCommand,
  Command,
  makeStreamEnvelopeHandler,
} from '@ocap/streams';

import type { UnresolvedMessages, VatId } from './types.js';
import { makeCounter } from './utils/makeCounter.js';

type VatConstructorProps = {
  id: VatId;
  streams: StreamPair<StreamEnvelope>;
};

export class Vat {
  readonly id: VatConstructorProps['id'];

  readonly #streams: VatConstructorProps['streams'];

  readonly #messageCounter: () => number;

  readonly unresolvedMessages: UnresolvedMessages = new Map();

  streamEnvelopeHandler?: StreamEnvelopeHandler;

  capTp?: ReturnType<typeof makeCapTP>;

  constructor({ id, streams }: VatConstructorProps) {
    this.id = id;
    this.#streams = streams;
    this.#messageCounter = makeCounter();
  }

  /**
   * Initializes the vat.
   *
   * @returns A promise that resolves when the vat is initialized.
   */
  async init(): Promise<unknown> {
    this.streamEnvelopeHandler = makeStreamEnvelopeHandler(
      {
        command: async ({ id, message }) => {
          const promiseCallbacks = this.unresolvedMessages.get(id);
          if (promiseCallbacks === undefined) {
            console.error(`No unresolved message with id "${id}".`);
          } else {
            this.unresolvedMessages.delete(id);
            promiseCallbacks.resolve(message.data);
          }
        },
      },
      console.warn,
    );

    /* v8 ignore next 4: Not known to be possible. */
    this.#receiveMessages(this.#streams.reader).catch((error) => {
      console.error(`Unexpected read error from vat "${this.id}"`, error);
      throw error;
    });

    await this.sendMessage({ type: Command.Ping, data: null });
    console.debug(`Created vat with id "${this.id}"`);

    return await this.makeCapTp();
  }

  /**
   * Receives messages from a vat.
   *
   * @param reader - The reader for the messages.
   */
  async #receiveMessages(reader: Reader<StreamEnvelope>): Promise<void> {
    for await (const rawMessage of reader) {
      console.debug('Offscreen received message', rawMessage);
      await this.streamEnvelopeHandler?.handle(rawMessage);
    }
  }

  /**
   * Make a CapTP connection.
   *
   * @returns A promise that resolves when the CapTP connection is made.
   */
  async makeCapTp(): Promise<unknown> {
    if (this.capTp !== undefined) {
      throw new Error(
        `Vat with id "${this.id}" already has a CapTP connection.`,
      );
    }

    if (!this.streamEnvelopeHandler) {
      throw new Error(
        `Vat with id "${this.id}" does not have a stream envelope handler.`,
      );
    }

    // Handle writes here. #receiveMessages() handles reads.
    const { writer } = this.#streams;
    // https://github.com/endojs/endo/issues/2412
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const ctp = makeCapTP(this.id, async (content: unknown) => {
      console.log('CapTP to vat', JSON.stringify(content, null, 2));
      await writer.next(wrapCapTp(content as CapTpMessage));
    });

    this.capTp = ctp;
    this.streamEnvelopeHandler.contentHandlers.capTp = async (
      content: CapTpMessage,
    ) => {
      console.log('CapTP from vat', JSON.stringify(content, null, 2));
      ctp.dispatch(content);
    };

    return this.sendMessage({ type: Command.CapTpInit, data: null });
  }

  /**
   * Call a CapTP method.
   *
   * @param payload - The CapTP payload.
   * @returns A promise that resolves the result of the CapTP call.
   */
  async callCapTp(payload: CapTpPayload): Promise<unknown> {
    if (!this.capTp) {
      throw new Error(
        `Vat with id "${this.id}" does not have a CapTP connection.`,
      );
    }
    return E(this.capTp.getBootstrap())[payload.method](...payload.params);
  }

  /**
   * Terminates the vat.
   */
  async terminate(): Promise<void> {
    await this.#streams.return();

    // Handle orphaned messages
    for (const [messageId, promiseCallback] of this.unresolvedMessages) {
      promiseCallback?.reject(new Error('Vat was deleted'));
      this.unresolvedMessages.delete(messageId);
    }
  }

  /**
   * Send a message to a vat.
   *
   * @param message - The message to send.
   * @returns A promise that resolves the response to the message.
   */
  public async sendMessage(message: VatMessage): Promise<unknown> {
    console.debug(`Sending message to vat "${this.id}"`, message);
    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextMessageId();
    this.unresolvedMessages.set(messageId, { reject, resolve });
    await this.#streams?.writer.next(
      wrapStreamCommand({ id: messageId, message }),
    );
    return promise;
  }

  /**
   * Gets the next message ID.
   *
   * @returns The message ID.
   */
  readonly #nextMessageId = (): MessageId => {
    return `${this.id}-${this.#messageCounter()}`;
  };
}
