import { isJsonRpcResponse } from '@metamask/utils';
import type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';
import type { VatWorkerManager, VatId, VatConfig } from '@ocap/kernel';
import { vatWorkerServiceMethodSpecs } from '@ocap/kernel/rpc';
import { Logger } from '@ocap/logger';
import { RpcClient } from '@ocap/rpc-methods';
import type { DuplexStream } from '@ocap/streams';
import {
  MessagePortDuplexStream,
  PostMessageDuplexStream,
} from '@ocap/streams/browser';
import type {
  PostMessageEnvelope,
  PostMessageTarget,
} from '@ocap/streams/browser';
import type { JsonRpcMessage } from '@ocap/utils';
import { isJsonRpcMessage, stringify } from '@ocap/utils';

// Appears in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ExtensionVatWorkerService } from './VatWorkerServer.ts';

export type VatWorkerClientStream = PostMessageDuplexStream<
  MessageEvent<JsonRpcResponse>,
  PostMessageEnvelope<JsonRpcRequest>
>;

export class ExtensionVatWorkerClient implements VatWorkerManager {
  readonly #logger: Logger;

  readonly #stream: VatWorkerClientStream;

  readonly #rpcClient: RpcClient<typeof vatWorkerServiceMethodSpecs>;

  readonly #portMap: Map<JsonRpcId, MessagePort | undefined>;

  /**
   * **ATTN:** Prefer {@link ExtensionVatWorkerClient.make} over constructing
   * this class directly.
   *
   * The client end of the vat worker service, intended to be constructed in
   * the kernel worker. Sends launch and terminate worker requests to the
   * server and wraps the launch response in a DuplexStream for consumption
   * by the kernel.
   *
   * Note that {@link ExtensionVatWorkerClient.start} must be called to start
   * the client.
   *
   * @see {@link ExtensionVatWorkerService} for the other end of the service.
   *
   * @param stream - The stream to use for communication with the server.
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker client]'.
   */
  constructor(stream: VatWorkerClientStream, logger?: Logger) {
    this.#stream = stream;
    this.#portMap = new Map();
    this.#logger = logger ?? new Logger('vat-worker-client');
    this.#rpcClient = new RpcClient(
      vatWorkerServiceMethodSpecs,
      async (request) => {
        if (request.method === 'launch') {
          this.#portMap.set(request.id, undefined);
        }
        await this.#stream.write({ payload: request, transfer: [] });
      },
      'm',
      this.#logger,
    );
  }

  /**
   * Create a new {@link ExtensionVatWorkerClient}. Does not start the client.
   *
   * @param messageTarget - The target to use for posting and receiving messages.
   * @param logger - An optional {@link Logger}.
   * @returns A new {@link ExtensionVatWorkerClient}.
   */
  static make(
    messageTarget: PostMessageTarget,
    logger?: Logger,
  ): ExtensionVatWorkerClient {
    const stream: VatWorkerClientStream = new PostMessageDuplexStream({
      messageTarget,
      messageEventMode: 'event',
      validateInput: (message): message is MessageEvent<JsonRpcResponse> =>
        message instanceof MessageEvent && isJsonRpcResponse(message.data),
    });
    return new ExtensionVatWorkerClient(stream, logger);
  }

  /**
   * Start the client. Must be called after construction.
   *
   * @returns A promise that fulfills when the client has stopped.
   */
  async start(): Promise<void> {
    return this.#stream
      .synchronize()
      .then(async () => this.#stream.drain(this.#handleMessage.bind(this)));
  }

  async launch(
    vatId: VatId,
    vatConfig: VatConfig,
  ): Promise<DuplexStream<JsonRpcMessage, JsonRpcMessage>> {
    const [id] = await this.#rpcClient.callAndGetId('launch', {
      vatId,
      vatConfig,
    });
    const port = this.#portMap.get(id);
    if (!port) {
      throw new Error(
        `No port found for launch of: ${stringify({ vatId, vatConfig })}`,
      );
    }
    this.#portMap.delete(id);
    return await MessagePortDuplexStream.make<JsonRpcMessage, JsonRpcMessage>(
      port,
      isJsonRpcMessage,
    );
  }

  async terminate(vatId: VatId): Promise<void> {
    await this.#rpcClient.call('terminate', { vatId });
  }

  async terminateAll(): Promise<void> {
    await this.#rpcClient.call('terminateAll', []);
  }

  async #handleMessage(event: MessageEvent<JsonRpcResponse>): Promise<void> {
    const { id } = event.data;
    const port = event.ports.at(0);
    if (typeof id !== 'string') {
      this.#logger.error(
        'Received response with unexpected id:',
        stringify(event.data),
      );
      return;
    }

    if (this.#portMap.has(id)) {
      this.#portMap.set(id, port);
    } else if (port !== undefined) {
      this.#logger.error(
        'Received message with unexpected port:',
        stringify(event.data),
      );
    }

    this.#rpcClient.handleResponse(id, event.data);
  }
}
harden(ExtensionVatWorkerClient);
