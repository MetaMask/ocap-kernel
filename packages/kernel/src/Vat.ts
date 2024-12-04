import { makeCapTP } from '@endo/captp';
import { E } from '@endo/eventual-send';
import type { Json } from '@metamask/utils';
import {
  VatCapTpConnectionExistsError,
  VatCapTpConnectionNotFoundError,
  VatDeletedError,
  StreamReadError,
} from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger, stringify } from '@ocap/utils';

import type { KVStore } from './kernel-store.js';
import { MessageResolver, VatCommandMethod } from './messages/index.js';
import type {
  CapTpPayload,
  VatCommandReply,
  VatCommandReturnType,
  VatCommand,
} from './messages/index.js';
import { isVatStorageMethod, VatStorageMethod } from './messages/vat.js';
import type { VatId, VatConfig } from './types.js';

type VatConstructorProps = {
  vatId: VatId;
  vatConfig: VatConfig;
  commandStream: DuplexStream<VatCommandReply, VatCommand>;
  capTpStream: DuplexStream<Json, Json>;
  logger?: Logger | undefined;
  store: KVStore;
};

export class Vat {
  readonly vatId: VatConstructorProps['vatId'];

  readonly #commandStream: VatConstructorProps['commandStream'];

  readonly #capTpStream: VatConstructorProps['capTpStream'];

  readonly #config: VatConstructorProps['vatConfig'];

  readonly logger: Logger;

  readonly #resolver: MessageResolver;

  readonly #store: KVStore;

  capTp?: ReturnType<typeof makeCapTP>;

  constructor({
    vatId,
    vatConfig,
    commandStream,
    capTpStream,
    logger,
    store,
  }: VatConstructorProps) {
    this.vatId = vatId;
    this.#config = vatConfig;
    this.logger = logger ?? makeLogger(`[vat ${vatId}]`);
    this.#commandStream = commandStream;
    this.#capTpStream = capTpStream;
    this.#resolver = new MessageResolver(vatId);
    this.#store = store;

    Promise.all([
      this.#commandStream.drain(this.handleMessage.bind(this)),
      this.#capTpStream.drain(async (content): Promise<void> => {
        this.logger.log('CapTP from vat', stringify(content));
        this.capTp?.dispatch(content);
      }),
    ]).catch(async (error) => {
      this.logger.error(`Unexpected read error`, error);
      await this.terminate(new StreamReadError({ vatId: this.vatId }, error));
    });
  }

  /**
   * Handle a message from the parent window.
   *
   * @param vatMessage - The vat message to handle.
   * @param vatMessage.id - The id of the message.
   * @param vatMessage.payload - The payload to handle.
   */
  async handleMessage({ id, payload }: VatCommandReply): Promise<void> {
    if (isVatStorageMethod(payload)) {
      switch (payload.params.method) {
        case VatStorageMethod.get:
          // eslint-disable-next-line no-case-declarations
          const value = this.#store.get(payload.params.params) ?? '';
          await this.#commandStream.write({
            id,
            payload: {
              method: payload.method,
              params: {
                method: payload.params.method,
                params: value,
              },
            },
          });
          break;
        case VatStorageMethod.set:
          this.#store.set(
            payload.params.params.key,
            payload.params.params.value,
          );
          await this.#commandStream.write({ id, payload });
          break;
        case VatStorageMethod.delete:
          this.#store.delete(payload.params.params);
          await this.#commandStream.write({ id, payload });
          break;
        default:
          throw new Error(`Unknown storage method: ${payload.method}`);
      }
    } else {
      this.#resolver.handleResponse(id, payload.params);
    }
  }

  /**
   * Initializes the vat.
   *
   * @returns A promise that resolves when the vat is initialized.
   */
  async init(): Promise<unknown> {
    await this.sendMessage({ method: VatCommandMethod.ping, params: null });
    const loadResult = await this.sendMessage({
      method: VatCommandMethod.initSupervisor,
      params: {
        vatId: this.vatId,
        config: this.#config,
      },
    });
    this.logger.log(`vat LoadUserCode result: `, loadResult);
    return await this.makeCapTp();
  }

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
   *
   * @param error - The error to terminate the vat with.
   */
  async terminate(error?: Error): Promise<void> {
    // eslint-disable-next-line promise/no-promise-in-callback
    await Promise.all([
      this.#commandStream.end(error),
      this.#capTpStream.end(error),
    ]);

    const terminationError = error ?? new VatDeletedError(this.vatId);
    this.#resolver.terminateAll(terminationError);
  }

  /**
   * Send a message to a vat.
   *
   * @param payload - The message to send.
   * @returns A promise that resolves the response to the message.
   */
  async sendMessage<Method extends VatCommand['payload']['method']>(
    payload: Extract<VatCommand['payload'], { method: Method }>,
  ): Promise<VatCommandReturnType[Method]> {
    this.logger.debug('Sending message to vat', payload);
    return this.#resolver.createMessage(async (messageId) => {
      await this.#commandStream.write({ id: messageId, payload });
    });
  }
}
