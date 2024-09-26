import { makeCapTP } from '@endo/captp';
import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import type { StreamPair, Reader } from '@ocap/streams';
import type {
  StreamEnvelope,
  StreamEnvelopeHandler,
  CapTpMessage,
  CapTpPayload,
  Command,
  VatMessage,
  Logger,
} from '@ocap/utils';
import {
  wrapCapTp,
  wrapStreamCommand,
  makeStreamEnvelopeHandler,
  CommandMethod,
  makeLogger,
  makeCounter,
} from '@ocap/utils';

import type { MessageId, UnresolvedMessages, VatId } from './types.js';

type VatConstructorProps = {
  id: VatId;
  streams: StreamPair<StreamEnvelope>;
};

export class Vat {
  readonly id: VatConstructorProps['id'];

  readonly streams: VatConstructorProps['streams'];

  readonly logger: Logger;

  readonly #messageCounter: () => number;

  readonly unresolvedMessages: UnresolvedMessages = new Map();

  readonly streamEnvelopeHandler: StreamEnvelopeHandler;

  capTp?: ReturnType<typeof makeCapTP>;

  constructor({ id, streams }: VatConstructorProps) {
    this.id = id;
    this.streams = streams;
    this.logger = makeLogger(`[vat ${id}]`);
    this.#messageCounter = makeCounter();
    this.streamEnvelopeHandler = makeStreamEnvelopeHandler(
      { command: this.handleMessage.bind(this) },
      (error) => console.error('Vat stream error:', error),
    );
  }

  /**
   * Handle a message from the parent window.
   *
   * @param vatMessage - The vat message to handle.
   * @param vatMessage.id - The id of the message.
   * @param vatMessage.payload - The payload to handle.
   */
  async handleMessage({ id, payload }: VatMessage): Promise<void> {
    const promiseCallbacks = this.unresolvedMessages.get(id);
    if (promiseCallbacks === undefined) {
      console.error(`No unresolved message with id "${id}".`);
    } else {
      this.unresolvedMessages.delete(id);
      promiseCallbacks.resolve(payload.params);
    }
  }

  /**
   * Initializes the vat.
   *
   * @returns A promise that resolves when the vat is initialized.
   */
  async init(): Promise<unknown> {
    /* v8 ignore next 4: Not known to be possible. */
    this.#receiveMessages(this.streams.reader).catch((error) => {
      this.logger.error(`Unexpected read error`, error);
      throw error;
    });

    await this.sendMessage({ method: CommandMethod.Ping, params: null });
    this.logger.debug('Created');

    return await this.makeCapTp();
  }

  /**
   * Receives messages from a vat.
   *
   * @param reader - The reader for the messages.
   */
  async #receiveMessages(reader: Reader<StreamEnvelope>): Promise<void> {
    for await (const rawMessage of reader) {
      this.logger.debug('Vat received message', rawMessage);
      await this.streamEnvelopeHandler.handle(rawMessage);
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

    // Handle writes here. #receiveMessages() handles reads.
    const { writer } = this.streams;
    const ctp = makeCapTP(this.id, async (content: unknown) => {
      this.logger.log('CapTP to vat', JSON.stringify(content, null, 2));
      await writer.next(wrapCapTp(content as CapTpMessage));
    });

    this.capTp = ctp;
    this.streamEnvelopeHandler.contentHandlers.capTp = async (
      content: CapTpMessage,
    ) => {
      this.logger.log('CapTP from vat', JSON.stringify(content, null, 2));
      ctp.dispatch(content);
    };

    return this.sendMessage({ method: CommandMethod.CapTpInit, params: null });
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
    await this.streams.return();

    // Handle orphaned messages
    for (const [messageId, promiseCallback] of this.unresolvedMessages) {
      promiseCallback?.reject(new Error('Vat was deleted'));
      this.unresolvedMessages.delete(messageId);
    }
  }

  /**
   * Send a message to a vat.
   *
   * @param payload - The message to send.
   * @returns A promise that resolves the response to the message.
   */
  async sendMessage(payload: Command): Promise<unknown> {
    this.logger.debug('Sending message to vat', payload);
    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextMessageId();
    this.unresolvedMessages.set(messageId, { reject, resolve });
    await this.streams.writer.next(
      wrapStreamCommand({ id: messageId, payload }),
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
