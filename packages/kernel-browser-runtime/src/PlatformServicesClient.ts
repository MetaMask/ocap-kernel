import { RpcClient, RpcService } from '@metamask/kernel-rpc-methods';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { isJsonRpcMessage, stringify } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type {
  PlatformServices,
  RemoteMessageHandler,
  VatId,
  VatConfig,
} from '@metamask/ocap-kernel';
import {
  platformServicesMethodSpecs,
  kernelRemoteHandlers,
} from '@metamask/ocap-kernel/rpc';
import { serializeError } from '@metamask/rpc-errors';
import type { DuplexStream } from '@metamask/streams';
import {
  MessagePortDuplexStream,
  PostMessageDuplexStream,
} from '@metamask/streams/browser';
import type {
  PostMessageEnvelope,
  PostMessageTarget,
} from '@metamask/streams/browser';
import { isJsonRpcResponse, isJsonRpcRequest } from '@metamask/utils';
import type { JsonRpcId } from '@metamask/utils';

// Appears in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { PlatformServicesServer } from './PlatformServicesServer.ts';

export type PlatformServicesClientStream = PostMessageDuplexStream<
  MessageEvent<JsonRpcMessage>,
  PostMessageEnvelope<JsonRpcMessage>
>;

export class PlatformServicesClient implements PlatformServices {
  readonly #logger: Logger;

  readonly #stream: PlatformServicesClientStream;

  readonly #rpcClient: RpcClient<typeof platformServicesMethodSpecs>;

  readonly #rpcServer: RpcService<typeof kernelRemoteHandlers>;

  readonly #portMap: Map<JsonRpcId, MessagePort | undefined>;

  #remoteMessageHandler: RemoteMessageHandler | undefined = undefined;

  /**
   * **ATTN:** Prefer {@link PlatformServicesClient.make} over constructing
   * this class directly.
   *
   * The client end of the platform services, intended to be constructed in
   * the kernel worker. Sends launch and terminate worker requests to the
   * server and wraps the launch response in a DuplexStream for consumption
   * by the kernel, and provides network connectivity.
   *
   * Note that {@link PlatformServicesClient.start} must be called to start
   * the client.
   *
   * @see {@link PlatformServicesServer} for the other end of the service.
   *
   * @param stream - The stream to use for communication with the server.
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[platform services client]'.
   */
  constructor(stream: PlatformServicesClientStream, logger?: Logger) {
    this.#stream = stream;
    this.#portMap = new Map();
    this.#logger = logger ?? new Logger('platform-services-client');
    this.#rpcClient = new RpcClient(
      platformServicesMethodSpecs,
      async (request) => {
        if ('id' in request) {
          if (request.method === 'launch') {
            this.#portMap.set(request.id, undefined);
          }
        }
        await this.#sendMessage(request);
      },
      'm',
      this.#logger,
    );
    this.#rpcServer = new RpcService(kernelRemoteHandlers, {
      remoteDeliver: this.#remoteDeliver.bind(this),
    });
  }

  /**
   * Create a new {@link PlatformServicesClient}. Does not start the client.
   *
   * @param messageTarget - The target to use for posting and receiving messages.
   * @param logger - An optional {@link Logger}.
   * @returns A new {@link PlatformServicesClient}.
   */
  static make(
    messageTarget: PostMessageTarget,
    logger?: Logger,
  ): PlatformServicesClient {
    const stream: PlatformServicesClientStream = new PostMessageDuplexStream({
      messageTarget,
      messageEventMode: 'event',
      validateInput: (message): message is MessageEvent<JsonRpcMessage> =>
        message instanceof MessageEvent && isJsonRpcMessage(message.data),
    });
    return new PlatformServicesClient(stream, logger);
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

  async initializeRemoteComms(
    keySeed: string,
    knownRelays: string[],
    remoteMessageHandler: (from: string, message: string) => Promise<string>,
  ): Promise<void> {
    this.#remoteMessageHandler = remoteMessageHandler;
    await this.#rpcClient.call('initializeRemoteComms', {
      keySeed,
      knownRelays,
    });
  }

  async sendRemoteMessage(to: string, message: string): Promise<void> {
    await this.#rpcClient.call('sendRemoteMessage', { to, message });
  }

  async #remoteDeliver(from: string, message: string): Promise<string> {
    if (this.#remoteMessageHandler) {
      return await this.#remoteMessageHandler(from, message);
    }
    throw Error(`remote message handler not set`);
  }

  async #sendMessage(payload: JsonRpcMessage): Promise<void> {
    await this.#stream.write({
      payload,
      transfer: [],
    });
  }

  async #handleMessage(event: MessageEvent<JsonRpcMessage>): Promise<void> {
    if (isJsonRpcResponse(event.data)) {
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
    } else if (isJsonRpcRequest(event.data)) {
      const { id, method, params } = event.data;
      try {
        this.#rpcServer.assertHasMethod(method);
        const result = await this.#rpcServer.execute(method, params);
        await this.#sendMessage({
          id,
          result,
          jsonrpc: '2.0',
        });
      } catch (error) {
        await this.#sendMessage({
          id,
          error: serializeError(error),
          jsonrpc: '2.0',
        });
      }
    }
  }
}
harden(PlatformServicesClient);
