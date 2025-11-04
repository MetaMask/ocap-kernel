import {
  VatAlreadyExistsError,
  VatNotFoundError,
} from '@metamask/kernel-errors';
import { RpcClient, RpcService } from '@metamask/kernel-rpc-methods';
import { isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type {
  VatId,
  VatConfig,
  SendRemoteMessage,
  StopRemoteComms,
} from '@metamask/ocap-kernel';
import { initNetwork } from '@metamask/ocap-kernel';
import {
  kernelRemoteMethodSpecs,
  platformServicesHandlers,
} from '@metamask/ocap-kernel/rpc';
import { serializeError } from '@metamask/rpc-errors';
import { PostMessageDuplexStream } from '@metamask/streams/browser';
import type {
  PostMessageEnvelope,
  PostMessageTarget,
} from '@metamask/streams/browser';
import { isJsonRpcRequest, isJsonRpcResponse } from '@metamask/utils';

// Appears in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { PlatformServicesClient } from './PlatformServicesClient.ts';

export type VatWorker = {
  launch: (vatConfig: VatConfig) => Promise<[MessagePort, unknown]>;
  terminate: () => Promise<null>;
};

export type PlatformServicesStream = PostMessageDuplexStream<
  MessageEvent<JsonRpcMessage>, // was JsonRpcRequest
  PostMessageEnvelope<JsonRpcMessage> // was JsonRpcResponse
>;

export class PlatformServicesServer {
  readonly #logger;

  readonly #stream: PlatformServicesStream;

  /** RPC client for delivering remote message events to the kernel */
  readonly #rpcClient: RpcClient<typeof kernelRemoteMethodSpecs>;

  /** RPC service for handling platform services requests */
  readonly #rpcServer: RpcService<typeof platformServicesHandlers>;

  readonly #vatWorkers: Map<VatId, VatWorker> = new Map();

  readonly #makeWorker: (vatId: VatId) => VatWorker;

  #sendRemoteMessageFunc: SendRemoteMessage | null = null;

  #stopRemoteCommsFunc: StopRemoteComms | null = null;

  /**
   * **ATTN:** Prefer {@link PlatformServicesServer.make} over constructing
   * this class directly.
   *
   * The server end of the platform services, intended to be constructed in
   * the offscreen document. Listens for launch and terminate worker requests
   * from the client and uses the {@link VatWorker} methods to effect those
   * requests, and provides network connectivity.
   *
   * Note that {@link PlatformServicesServer.start} must be called to start
   * the server.
   *
   * @see {@link PlatformServicesClient} for the other end of the service.
   *
   * @param stream - The stream to use for communication with the client.
   * @param makeWorker - A method for making a {@link VatWorker}.
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[platform services server]'.
   */
  constructor(
    stream: PlatformServicesStream,
    makeWorker: (vatId: VatId) => VatWorker,
    logger?: Logger,
  ) {
    this.#stream = stream;
    this.#makeWorker = makeWorker;
    this.#logger = logger ?? new Logger('platform-services-server');

    this.#rpcClient = new RpcClient(
      kernelRemoteMethodSpecs,
      async (request) => {
        await this.#sendMessage(request);
      },
      `vws:`,
      this.#logger.subLogger({ tags: ['rpc-client'] }),
    );

    this.#rpcServer = new RpcService(platformServicesHandlers, {
      launch: this.#launch.bind(this),
      terminate: this.#terminate.bind(this),
      terminateAll: this.#terminateAll.bind(this),
      initializeRemoteComms: this.#initializeRemoteComms.bind(this),
      sendRemoteMessage: this.#sendRemoteMessage.bind(this),
      stopRemoteComms: this.#stopRemoteComms.bind(this),
    });

    // Start draining messages immediately after construction
    this.#stream
      .drain(this.#handleMessage.bind(this))
      .catch((error: unknown) => {
        this.#logger.error('Error draining stream:', error);
      });
  }

  /**
   * Create a new {@link PlatformServicesServer}. Does not start the server.
   *
   * @param messageTarget - The target to use for posting and receiving messages.
   * @param makeWorker - A method for making a {@link VatWorker}.
   * @param logger - An optional {@link Logger}.
   * @returns A new {@link PlatformServicesServer}.
   */
  static async make(
    messageTarget: PostMessageTarget,
    makeWorker: (vatId: VatId) => VatWorker,
    logger?: Logger,
  ): Promise<PlatformServicesServer> {
    const stream: PlatformServicesStream = new PostMessageDuplexStream({
      messageTarget,
      messageEventMode: 'event',
      validateInput: (
        message: unknown,
      ): message is MessageEvent<JsonRpcMessage> =>
        message instanceof MessageEvent && isJsonRpcMessage(message.data),
    });
    await stream.synchronize();
    return new PlatformServicesServer(stream, makeWorker, logger);
  }

  async #handleMessage(event: MessageEvent<JsonRpcMessage>): Promise<void> {
    if (isJsonRpcResponse(event.data)) {
      const message = event.data;
      this.#rpcClient.handleResponse(message.id as string, message);
    } else if (isJsonRpcRequest(event.data)) {
      const { id, method, params } = event.data;
      try {
        this.#rpcServer.assertHasMethod(method);
        // Ridiculous cast to bypass TypeScript vs. JsonRpc tug-o-war
        const port: MessagePort | undefined = (await this.#rpcServer.execute(
          method,
          params,
        )) as unknown as MessagePort | undefined;
        await this.#sendMessage({ id, result: null, jsonrpc: '2.0' }, port);
      } catch (error) {
        this.#logger.error(`Error handling "${method}" request:`, error);
        this.#sendMessage({
          id,
          error: serializeError(error),
          jsonrpc: '2.0',
        }).catch(() => undefined);
      }
    }
  }

  async #sendMessage(
    message: JsonRpcMessage,
    port?: MessagePort,
  ): Promise<void> {
    await this.#stream.write({
      payload: message,
      transfer: port ? [port] : [],
    });
  }

  async #launch(vatId: VatId, vatConfig: VatConfig): Promise<null> {
    if (this.#vatWorkers.has(vatId)) {
      throw new VatAlreadyExistsError(vatId);
    }
    const vatWorker = this.#makeWorker(vatId);
    const [port] = await vatWorker.launch(vatConfig);
    this.#vatWorkers.set(vatId, vatWorker);
    // This cast is a deliberate lie, to bypass TypeScript vs. JsonRpc tug-o-war
    return port as unknown as null;
  }

  async #terminate(vatId: VatId): Promise<null> {
    const vatWorker = this.#vatWorkers.get(vatId);
    if (!vatWorker) {
      throw new VatNotFoundError(vatId);
    }
    await vatWorker.terminate();
    this.#vatWorkers.delete(vatId);
    return null;
  }

  async #terminateAll(): Promise<null> {
    await Promise.all(
      Array.from(this.#vatWorkers.keys()).map(async (vatId) =>
        this.#terminate(vatId),
      ),
    );
    return null;
  }

  async #initializeRemoteComms(
    keySeed: string,
    knownRelays: string[],
  ): Promise<null> {
    if (this.#sendRemoteMessageFunc) {
      throw Error('remote comms already initialized');
    }
    const { sendRemoteMessage, stop } = await initNetwork(
      keySeed,
      knownRelays,
      this.#handleRemoteMessage.bind(this),
    );
    this.#sendRemoteMessageFunc = sendRemoteMessage;
    this.#stopRemoteCommsFunc = stop;
    return null;
  }

  async #stopRemoteComms(): Promise<null> {
    if (!this.#stopRemoteCommsFunc) {
      return null;
    }
    await this.#stopRemoteCommsFunc();
    this.#sendRemoteMessageFunc = null;
    this.#stopRemoteCommsFunc = null;
    return null;
  }

  async #sendRemoteMessage(
    to: string,
    message: string,
    hints: string[] = [],
  ): Promise<null> {
    if (!this.#sendRemoteMessageFunc) {
      throw Error('remote comms not initialized');
    }
    await this.#sendRemoteMessageFunc(to, message, hints);
    return null;
  }

  async #handleRemoteMessage(from: string, message: string): Promise<string> {
    const possibleReply = await this.#rpcClient.call('remoteDeliver', {
      from,
      message,
    });
    if (possibleReply !== '') {
      await this.#sendRemoteMessage(from, possibleReply, []);
    }
    return '';
  }
}
harden(PlatformServicesServer);
