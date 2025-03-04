import { makePromiseKit } from '@endo/promise-kit';
import type { PromiseKit } from '@endo/promise-kit';
import { isObject } from '@metamask/utils';
import {
  isVatCommandReply,
  isVatWorkerServiceReply,
  VatWorkerServiceCommandMethod,
} from '@ocap/kernel';
import type {
  VatWorkerService,
  VatId,
  VatWorkerServiceCommand,
  VatConfig,
  VatWorkerServiceReply,
  VatCommand,
  VatCommandReply,
} from '@ocap/kernel';
import {
  MessagePortDuplexStream,
  PostMessageDuplexStream,
} from '@ocap/streams';
import type {
  DuplexStream,
  PostMessageEnvelope,
  PostMessageTarget,
} from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeCounter, makeLogger } from '@ocap/utils';

// Appears in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ExtensionVatWorkerServer } from './VatWorkerServer.ts';

type PromiseCallbacks<Resolve = unknown> = Omit<PromiseKit<Resolve>, 'promise'>;

export type VatWorkerClientStream = PostMessageDuplexStream<
  MessageEvent<VatWorkerServiceReply>,
  PostMessageEnvelope<VatWorkerServiceCommand>
>;

export class ExtensionVatWorkerClient implements VatWorkerService {
  readonly #logger: Logger;

  readonly #stream: VatWorkerClientStream;

  readonly #unresolvedMessages: Map<
    VatWorkerServiceCommand['id'],
    PromiseCallbacks
  > = new Map();

  readonly #messageCounter = makeCounter();

  /**
   * @see {@link ExtensionVatWorkerClient.make}.
   * @param stream - The stream to use for communication with the server.
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker client]'.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor(stream: VatWorkerClientStream, logger?: Logger) {
    this.#stream = stream;
    this.#logger = logger ?? makeLogger('[vat worker client]');
  }

  /**
   * The client end of the vat worker service, intended to be constructed in
   * the kernel worker. Sends launch and terminate worker requests to the
   * server and wraps the launch response in a DuplexStream for consumption
   * by the kernel.
   *
   * @see {@link ExtensionVatWorkerServer} for the other end of the service.
   *
   * @param messageTarget - The target to use for posting and receiving messages.
   * @param logger - An optional {@link Logger}.
   * @returns A new {@link ExtensionVatWorkerClient} and a promise that resolves when the client
   * has stopped.
   */
  static make(
    messageTarget: PostMessageTarget,
    logger?: Logger,
  ): [ExtensionVatWorkerClient, Promise<void>] {
    const stream: VatWorkerClientStream = new PostMessageDuplexStream({
      messageTarget,
      messageEventMode: 'event',
      validateInput: (
        message,
      ): message is MessageEvent<VatWorkerServiceReply> =>
        message instanceof MessageEvent &&
        isVatWorkerServiceReply(message.data),
    });
    const client = new ExtensionVatWorkerClient(stream, logger);
    return [client, client.#start()];
  }

  /**
   * Constructor helper that must be called in order for the client to send and
   * receive messages.
   *
   * @returns A promise that fulfills when the client has stopped.
   */
  async #start(): Promise<void> {
    return this.#stream
      .synchronize()
      .then(async () => this.#stream.drain(this.#handleMessage.bind(this)));
  }

  async #sendMessage<Return>(
    payload: VatWorkerServiceCommand['payload'],
  ): Promise<Return> {
    const message: VatWorkerServiceCommand = {
      id: `m${this.#messageCounter()}`,
      payload,
    };
    const { promise, resolve, reject } = makePromiseKit<Return>();
    this.#unresolvedMessages.set(message.id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    await this.#stream.write({ payload: message, transfer: [] });
    return promise;
  }

  async launch(
    vatId: VatId,
    vatConfig: VatConfig,
  ): Promise<DuplexStream<VatCommandReply, VatCommand>> {
    return this.#sendMessage({
      method: VatWorkerServiceCommandMethod.launch,
      params: { vatId, vatConfig },
    });
  }

  async terminate(vatId: VatId): Promise<void> {
    return this.#sendMessage({
      method: VatWorkerServiceCommandMethod.terminate,
      params: { vatId },
    });
  }

  async terminateAll(): Promise<void> {
    return this.#sendMessage({
      method: VatWorkerServiceCommandMethod.terminateAll,
      params: null,
    });
  }

  async #handleMessage(
    event: MessageEvent<VatWorkerServiceReply>,
  ): Promise<void> {
    const { id, payload } = event.data;
    const { method } = payload;
    const port = event.ports.at(0);

    const promise = this.#unresolvedMessages.get(id);

    if (!promise) {
      this.#logger.error('Received unexpected reply', event.data);
      return;
    }

    if (isObject(payload.params) && payload.params.error) {
      promise.reject(payload.params.error);
      return;
    }

    switch (method) {
      case VatWorkerServiceCommandMethod.launch:
        if (!port) {
          this.#logger.error('Expected a port with message reply', event);
          return;
        }
        promise.resolve(
          MessagePortDuplexStream.make<VatCommandReply, VatCommand>(
            port,
            isVatCommandReply,
          ),
        );
        break;
      case VatWorkerServiceCommandMethod.terminate:
      case VatWorkerServiceCommandMethod.terminateAll:
        // If we were caching streams on the client this would be a good place
        // to remove them.
        promise.resolve(undefined);
        break;
      default:
        this.#logger.error(
          'Received message with unexpected method',
          // @ts-expect-error Compile-time exhaustiveness check
          method.valueOf(),
        );
    }
  }
}
harden(ExtensionVatWorkerClient);
