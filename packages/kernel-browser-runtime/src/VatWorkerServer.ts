import {
  VatAlreadyExistsError,
  VatNotFoundError,
} from '@metamask/kernel-errors';
import type { ExtractParams } from '@metamask/kernel-rpc-methods';
import { Logger } from '@metamask/logger';
import type { VatId, VatConfig } from '@metamask/ocap-kernel';
import type { VatWorkerServiceMethod } from '@metamask/ocap-kernel/rpc';
import { vatWorkerServiceMethodSpecs } from '@metamask/ocap-kernel/rpc';
import { rpcErrors, serializeError } from '@metamask/rpc-errors';
import { PostMessageDuplexStream } from '@metamask/streams/browser';
import type {
  PostMessageEnvelope,
  PostMessageTarget,
} from '@metamask/streams/browser';
import { hasProperty, isJsonRpcRequest } from '@metamask/utils';
import type {
  JsonRpcId,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';

// Appears in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { VatWorkerClient } from './VatWorkerClient.ts';

export type VatWorker = {
  launch: (vatConfig: VatConfig) => Promise<[MessagePort, unknown]>;
  terminate: () => Promise<void>;
};

export type VatWorkerServiceStream = PostMessageDuplexStream<
  MessageEvent<JsonRpcRequest>,
  PostMessageEnvelope<JsonRpcResponse>
>;

export class VatWorkerServer {
  readonly #logger;

  readonly #stream: VatWorkerServiceStream;

  readonly #vatWorkers: Map<VatId, VatWorker> = new Map();

  readonly #makeWorker: (vatId: VatId) => VatWorker;

  /**
   * **ATTN:** Prefer {@link VatWorkerServer.make} over constructing
   * this class directly.
   *
   * The server end of the vat worker service, intended to be constructed in
   * the offscreen document. Listens for launch and terminate worker requests
   * from the client and uses the {@link VatWorker} methods to effect those
   * requests.
   *
   * Note that {@link VatWorkerServer.start} must be called to start
   * the server.
   *
   * @see {@link VatWorkerClient} for the other end of the service.
   *
   * @param stream - The stream to use for communication with the client.
   * @param makeWorker - A method for making a {@link VatWorker}.
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker server]'.
   */
  constructor(
    stream: VatWorkerServiceStream,
    makeWorker: (vatId: VatId) => VatWorker,
    logger?: Logger,
  ) {
    this.#stream = stream;
    this.#makeWorker = makeWorker;
    this.#logger = logger ?? new Logger('vat-worker-server');
  }

  /**
   * Create a new {@link VatWorkerServer}. Does not start the server.
   *
   * @param messageTarget - The target to use for posting and receiving messages.
   * @param makeWorker - A method for making a {@link VatWorker}.
   * @param logger - An optional {@link Logger}.
   * @returns A new {@link VatWorkerServer}.
   */
  static make(
    messageTarget: PostMessageTarget,
    makeWorker: (vatId: VatId) => VatWorker,
    logger?: Logger,
  ): VatWorkerServer {
    const stream: VatWorkerServiceStream = new PostMessageDuplexStream({
      messageTarget,
      messageEventMode: 'event',
      validateInput: (message): message is MessageEvent<JsonRpcRequest> =>
        message instanceof MessageEvent && isJsonRpcRequest(message.data),
    });

    return new VatWorkerServer(stream, makeWorker, logger);
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

  #assertHasMethod(method: string): asserts method is VatWorkerServiceMethod {
    if (!hasProperty(vatWorkerServiceMethodSpecs, method)) {
      throw rpcErrors.methodNotFound();
    }
  }

  #assertParams<Method extends VatWorkerServiceMethod>(
    method: Method,
    params: unknown,
  ): asserts params is ExtractParams<
    Method,
    typeof vatWorkerServiceMethodSpecs
  > {
    vatWorkerServiceMethodSpecs[method].params.assert(params);
  }

  async #handleMessage(event: MessageEvent<JsonRpcRequest>): Promise<void> {
    const { id, method, params } = event.data;
    try {
      await this.#executeMethod(id, method, params);
    } catch (error) {
      this.#logger.error(`Error handling "${method}" request:`, error);
      this.#sendMessage({
        id,
        error: serializeError(error),
        jsonrpc: '2.0',
      }).catch(() => undefined);
    }
  }

  async #executeMethod(
    messageId: JsonRpcId,
    method: string,
    params: JsonRpcParams | undefined,
  ): Promise<void> {
    this.#assertHasMethod(method);

    let port: MessagePort | undefined;

    switch (method) {
      case 'launch': {
        this.#assertParams(method, params);
        const { vatId, vatConfig } = params;
        port = await this.#launch(vatId, vatConfig);
        break;
      }
      case 'terminate':
        this.#assertParams(method, params);
        await this.#terminate(params.vatId);
        break;
      case 'terminateAll':
        this.#assertParams(method, params);
        await Promise.all(
          Array.from(this.#vatWorkers.keys()).map(async (vatId) =>
            this.#terminate(vatId),
          ),
        );
        break;
      default:
        this.#logger.error(
          'Received message with unexpected method',
          // @ts-expect-error Compile-time exhaustiveness check
          method.valueOf(),
        );
        throw rpcErrors.methodNotFound();
    }
    await this.#sendMessage(
      { id: messageId, result: null, jsonrpc: '2.0' },
      port,
    );
  }

  async #sendMessage(
    message: JsonRpcResponse,
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
harden(VatWorkerServer);
