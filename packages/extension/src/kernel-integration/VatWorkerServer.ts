import { VatAlreadyExistsError, VatNotFoundError } from '@ocap/errors';
import {
  isVatWorkerServiceCommand,
  VatWorkerServiceCommandMethod,
} from '@ocap/kernel';
import type {
  VatWorkerServiceReply,
  VatId,
  VatConfig,
  VatWorkerServiceCommand,
} from '@ocap/kernel';
import { PostMessageDuplexStream } from '@ocap/streams';
import type { PostMessageEnvelope, PostMessageTarget } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';

// Appears in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ExtensionVatWorkerClient } from './VatWorkerClient.ts';

export type VatWorker = {
  launch: (vatConfig: VatConfig) => Promise<[MessagePort, unknown]>;
  terminate: () => Promise<void>;
};

export type VatWorkerServerStream = PostMessageDuplexStream<
  MessageEvent<VatWorkerServiceCommand>,
  PostMessageEnvelope<VatWorkerServiceReply>
>;

export class ExtensionVatWorkerServer {
  readonly #logger;

  readonly #stream: VatWorkerServerStream;

  readonly #vatWorkers: Map<VatId, VatWorker> = new Map();

  readonly #makeWorker: (vatId: VatId) => VatWorker;

  /**
   * **ATTN:** Prefer {@link ExtensionVatWorkerServer.make} over constructing
   * this class directly.
   *
   * The server end of the vat worker service, intended to be constructed in
   * the offscreen document. Listens for launch and terminate worker requests
   * from the client and uses the {@link VatWorker} methods to effect those
   * requests.
   *
   * Note that {@link ExtensionVatWorkerServer.start} must be called to start
   * the server.
   *
   * @see {@link ExtensionVatWorkerClient} for the other end of the service.
   *
   * @param stream - The stream to use for communication with the client.
   * @param makeWorker - A method for making a {@link VatWorker}.
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker server]'.
   */
  constructor(
    stream: VatWorkerServerStream,
    makeWorker: (vatId: VatId) => VatWorker,
    logger?: Logger,
  ) {
    this.#stream = stream;
    this.#makeWorker = makeWorker;
    this.#logger = logger ?? makeLogger('[vat worker server]');
  }

  /**
   * Create a new {@link ExtensionVatWorkerServer}. Does not start the server.
   *
   * @param messageTarget - The target to use for posting and receiving messages.
   * @param makeWorker - A method for making a {@link VatWorker}.
   * @param logger - An optional {@link Logger}.
   * @returns A new {@link ExtensionVatWorkerServer}.
   */
  static make(
    messageTarget: PostMessageTarget,
    makeWorker: (vatId: VatId) => VatWorker,
    logger?: Logger,
  ): ExtensionVatWorkerServer {
    const stream: VatWorkerServerStream = new PostMessageDuplexStream({
      messageTarget,
      messageEventMode: 'event',
      validateInput: (
        message,
      ): message is MessageEvent<VatWorkerServiceCommand> =>
        message instanceof MessageEvent &&
        isVatWorkerServiceCommand(message.data),
    });

    return new ExtensionVatWorkerServer(stream, makeWorker, logger);
  }

  /**
   * Start the server. Must be called after construction.
   *
   * @returns A promise that fulfills when the server has stopped.
   */
  async start(): Promise<void> {
    return this.#stream
      .synchronize()
      .then(async () => this.#stream.drain(this.#handleMessage.bind(this)));
  }

  async #handleMessage(
    event: MessageEvent<VatWorkerServiceCommand>,
  ): Promise<void> {
    const { id, payload } = event.data;
    const { method, params } = payload;

    const handleError = (error: Error, vatId: VatId): void => {
      this.#logger.error(`Error handling ${method} for vatId ${vatId}`, error);
      // eslint-disable-next-line promise/no-promise-in-callback
      this.#sendMessage({
        id,
        payload: { method, params: { vatId, error } },
      }).catch(() => undefined);
    };

    switch (method) {
      case VatWorkerServiceCommandMethod.launch: {
        const { vatId, vatConfig } = params;
        const replyParams = { vatId };
        const replyPayload = { method, params: replyParams };
        await this.#launch(vatId, vatConfig)
          .then(async (port) =>
            this.#sendMessage({ id, payload: replyPayload }, port),
          )
          .catch(async (error) => handleError(error, vatId));
        break;
      }
      case VatWorkerServiceCommandMethod.terminate:
        await this.#terminate(params.vatId)
          .then(async () => this.#sendMessage({ id, payload }))
          .catch(async (error) => handleError(error, params.vatId));
        break;
      case VatWorkerServiceCommandMethod.terminateAll:
        await Promise.all(
          Array.from(this.#vatWorkers.keys()).map(async (vatId) =>
            this.#terminate(vatId).catch((error) => handleError(error, vatId)),
          ),
        );
        await this.#sendMessage({ id, payload });
        break;
      default:
        this.#logger.error(
          'Received message with unexpected method',
          // @ts-expect-error Compile-time exhaustiveness check
          method.valueOf(),
        );
    }
  }

  async #sendMessage(
    message: VatWorkerServiceReply,
    port?: MessagePort,
  ): Promise<void> {
    await this.#stream.write({
      payload: message,
      transfer: port ? [port] : [],
    });
  }

  async #launch(vatId: VatId, vatConfig: VatConfig): Promise<MessagePort> {
    if (this.#vatWorkers.has(vatId)) {
      throw new VatAlreadyExistsError(vatId);
    }
    const vatWorker = this.#makeWorker(vatId);
    const [port] = await vatWorker.launch(vatConfig);
    this.#vatWorkers.set(vatId, vatWorker);
    return port;
  }

  async #terminate(vatId: VatId): Promise<void> {
    const vatWorker = this.#vatWorkers.get(vatId);
    if (!vatWorker) {
      throw new VatNotFoundError(vatId);
    }
    await vatWorker.terminate();
    this.#vatWorkers.delete(vatId);
  }
}
harden(ExtensionVatWorkerServer);
