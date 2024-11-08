import { makeCapTP } from '@endo/captp';
import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import type { Json } from '@metamask/utils';
import {
  VatCapTpConnectionExistsError,
  VatCapTpConnectionNotFoundError,
  VatDeletedError,
  StreamReadError,
} from '@ocap/errors';
import type { HandledDuplexStream, StreamMultiplexer } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger, makeCounter, stringify } from '@ocap/utils';

import { isVatCommandReply, VatCommandMethod } from './messages/index.js';
import type {
  CapTpPayload,
  VatCommandReply,
  VatCommand,
} from './messages/index.js';
import type { PromiseCallbacks, VatId, VatConfig } from './types.js';

type VatConstructorProps = {
  vatId: VatId;
  vatConfig: VatConfig;
  multiplexer: StreamMultiplexer;
  logger?: Logger | undefined;
};

export class Vat {
  readonly vatId: VatConstructorProps['vatId'];

  readonly #multiplexer: StreamMultiplexer;

  readonly #commandStream: HandledDuplexStream<VatCommandReply, VatCommand>;

  readonly #capTpStream: HandledDuplexStream<Json, Json>;

  readonly #config: VatConstructorProps['vatConfig'];

  readonly logger: Logger;

  readonly #messageCounter: () => number;

  readonly unresolvedMessages: Map<VatCommand['id'], PromiseCallbacks> =
    new Map();

  capTp?: ReturnType<typeof makeCapTP>;

  constructor({ vatId, vatConfig, multiplexer, logger }: VatConstructorProps) {
    this.vatId = vatId;
    this.#config = vatConfig;
    this.logger = logger ?? makeLogger(`[vat ${vatId}]`);
    this.#messageCounter = makeCounter();
    this.#multiplexer = multiplexer;
    this.#commandStream = multiplexer.addChannel(
      'command',
      this.handleMessage.bind(this),
      isVatCommandReply,
    );
    this.#capTpStream = multiplexer.addChannel(
      'capTp',
      async (content): Promise<void> => {
        this.logger.log('CapTP from vat', stringify(content));
        this.capTp?.dispatch(content);
      },
    );
  }

  /**
   * Handle a message from the parent window.
   *
   * @param vatMessage - The vat message to handle.
   * @param vatMessage.id - The id of the message.
   * @param vatMessage.payload - The payload to handle.
   */
  async handleMessage({ id, payload }: VatCommandReply): Promise<void> {
    const promiseCallbacks = this.unresolvedMessages.get(id);
    if (promiseCallbacks === undefined) {
      this.logger.error(`No unresolved message with id "${id}".`);
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
    this.#multiplexer.drainAll().catch((error) => {
      this.logger.error(`Unexpected read error`, error);
      throw new StreamReadError({ vatId: this.vatId }, error);
    });
    /*
    this.#receiveMessages(this.#stream).catch((error) => {
      this.logger.error(`Unexpected read error`, error);
      throw new StreamReadError({ vatId: this.vatId }, error);
    });
    */

    await this.sendMessage({ method: VatCommandMethod.ping, params: null });
    const loadResult = await this.sendMessage({
      method: VatCommandMethod.loadUserCode,
      params: this.#config,
    });
    console.log(`vat LoadUserCode result: `, loadResult);
    this.logger.debug('Created');

    return await this.makeCapTp();
  }

  /**
   * Receives messages from a vat.
   *
   * @param reader - The reader for the messages.
   */
  /*
  async #receiveMessages(reader: Reader<StreamEnvelopeReply>): Promise<void> {
    for await (const rawMessage of reader) {
      console.log(`Vat received message ${JSON.stringify(rawMessage)}`);
      this.logger.debug('Vat received message', rawMessage);
      await this.streamEnvelopeReplyHandler.handle(rawMessage);
    }
  }
  */

  /**
   * Make a CapTP connection.
   *
   * @returns A promise that resolves when the CapTP connection is made.
   */
  async makeCapTp(): Promise<unknown> {
    if (this.capTp !== undefined) {
      throw new VatCapTpConnectionExistsError(this.vatId);
    }

    const ctp = makeCapTP(this.vatId, async (content: Json) => {
      this.logger.log('CapTP to vat', stringify(content));
      await this.#capTpStream.write(content);
    });

    this.capTp = ctp;

    return this.sendMessage({
      method: VatCommandMethod.capTpInit,
      params: null,
    });
  }

  /**
   * Call a CapTP method.
   *
   * @param payload - The CapTP payload.
   * @returns A promise that resolves the result of the CapTP call.
   */
  async callCapTp(payload: CapTpPayload): Promise<unknown> {
    if (!this.capTp) {
      throw new VatCapTpConnectionNotFoundError(this.vatId);
    }
    return E(this.capTp.getBootstrap())[payload.method](...payload.params);
  }

  /**
   * Terminates the vat.
   */
  async terminate(): Promise<void> {
    await this.#multiplexer.return();

    // Handle orphaned messages
    for (const [messageId, promiseCallback] of this.unresolvedMessages) {
      promiseCallback?.reject(new VatDeletedError(this.vatId));
      this.unresolvedMessages.delete(messageId);
    }
  }

  /**
   * Send a message to a vat.
   *
   * @param payload - The message to send.
   * @returns A promise that resolves the response to the message.
   */
  async sendMessage(payload: VatCommand['payload']): Promise<unknown> {
    this.logger.debug('Sending message to vat', payload);
    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextMessageId();
    this.unresolvedMessages.set(messageId, { reject, resolve });
    await this.#commandStream.write({ id: messageId, payload });
    return promise;
  }

  /**
   * Gets the next message ID.
   *
   * @returns The message ID.
   */
  readonly #nextMessageId = (): VatCommand['id'] => {
    return `${this.vatId}:${this.#messageCounter()}`;
  };
}
