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
import type { PromiseCallbacks, VatId } from './types.js';

type VatConstructorProps = {
  id: VatId;
  multiplexer: StreamMultiplexer;
  logger?: Logger | undefined;
};

export class Vat {
  readonly id: VatConstructorProps['id'];

  readonly #multiplexer: StreamMultiplexer;

  readonly #commandStream: HandledDuplexStream<VatCommandReply, VatCommand>;

  readonly #capTpStream: HandledDuplexStream<Json, Json>;

  readonly logger: Logger;

  readonly #messageCounter: () => number;

  readonly unresolvedMessages: Map<VatCommand['id'], PromiseCallbacks> =
    new Map();

  capTp?: ReturnType<typeof makeCapTP>;

  constructor({ id, multiplexer, logger }: VatConstructorProps) {
    this.id = id;
    this.logger = logger ?? makeLogger(`[vat ${id}]`);
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
      throw new StreamReadError({ vatId: this.id }, error);
    });

    await this.sendMessage({ method: VatCommandMethod.ping, params: null });
    this.logger.debug('Created');

    return await this.makeCapTp();
  }

  /**
   * Make a CapTP connection.
   *
   * @returns A promise that resolves when the CapTP connection is made.
   */
  async makeCapTp(): Promise<unknown> {
    if (this.capTp !== undefined) {
      throw new VatCapTpConnectionExistsError(this.id);
    }

    const ctp = makeCapTP(this.id, async (content: Json) => {
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
      throw new VatCapTpConnectionNotFoundError(this.id);
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
      promiseCallback?.reject(new VatDeletedError(this.id));
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
    return `${this.id}:${this.#messageCounter()}`;
  };
}
