import { makeCapTP } from '@endo/captp';
import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import type { StreamPair } from '@ocap/streams';
import { makeMessagePortStreamPair } from '@ocap/streams';

import type {
  CapTpMessage,
  CapTpPayload,
  MessageId,
  UnresolvedMessages,
  VatMessage,
} from './types.ts';
import { Command } from './types.ts';
import { makeCounter } from './utils/makeCounter.ts';

export type VatBaseProps = {
  id: string;
};

export abstract class VatBase {
  readonly id: string;

  readonly #messageCounter: () => number;

  readonly unresolvedMessages: UnresolvedMessages = new Map();

  streams: StreamPair<StreamEnvelope>;

  streamEnvelopeHandler: StreamEnvelopeHandler;

  capTp?: ReturnType<typeof makeCapTP>;

  constructor({ id }: VatBaseProps) {
    this.id = id;
    this.#messageCounter = makeCounter();
  }

  /**
   * Initializes the vat.
   *
   * @param port - The message port to use for communication.
   * @returns A promise that resolves when the vat is initialized.
   */
  async init(port: MessagePort): Promise<void> {
    this.streams = makeMessagePortStreamPair<StreamEnvelope>(port);
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

    await this.sendMessage({ type: Command.Ping, data: null });
    console.debug(`Created vat with id "${this.id}"`);
  }

  /**
   * Make a CapTP connection.
   *
   * @returns A promise that resolves when the CapTP connection is made.
   */
  async makeCapTp(): Promise<unknown> {
    if (!this.capTp) {
      throw new Error(
        `Vat with id "${this.id}" already has a CapTP connection.`,
      );
    }

    // Handle writes here. #receiveMessages() handles reads.
    const { writer } = this.streams;
    // https://github.com/endojs/endo/issues/2412
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const ctp = makeCapTP(this.id, async (content: unknown) => {
      console.log('CapTP to vat', JSON.stringify(content, null, 2));
      await writer.next(wrapCapTp(content as CapTpMessage));
    });

    this.capTp = ctp;
    this.streamEnvelopeHandler.contentHandlers.capTp = async (
      content: string,
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
  terminate(): void {
    this.streams.return();

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
    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextMessageId();
    this.unresolvedMessages.set(messageId, { reject, resolve });
    await this.streams.writer.next(wrapCommand({ id: messageId, message }));
    return promise;
  }

  /**
   * Gets the next message ID.
   *
   * @param id - The vat ID.
   * @returns The message ID.
   */
  readonly #nextMessageId = (): MessageId => {
    return `${this.id}-${this.#messageCounter()}`;
  };
}
