import { makePromiseKit } from '@endo/promise-kit';
import type { PromiseKit } from '@endo/promise-kit';
import { isObject } from '@metamask/utils';
import { unmarshalError } from '@ocap/errors';
import {
  VatWorkerServiceCommandMethod,
  isVatWorkerServiceCommandReply,
} from '@ocap/kernel';
import type {
  VatWorkerService,
  VatId,
  VatWorkerServiceCommand,
} from '@ocap/kernel';
import type { DuplexStream, MultiplexEnvelope } from '@ocap/streams';
import { isMultiplexEnvelope, MessagePortDuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeCounter, makeHandledCallback, makeLogger } from '@ocap/utils';

import type { AddListener, PostMessage } from './vat-worker-service.js';
// Appears in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ExtensionVatWorkerServer } from './VatWorkerServer.js';

type PromiseCallbacks<Resolve = unknown> = Omit<PromiseKit<Resolve>, 'promise'>;

export class ExtensionVatWorkerClient implements VatWorkerService {
  readonly #logger: Logger;

  readonly #unresolvedMessages: Map<
    VatWorkerServiceCommand['id'],
    PromiseCallbacks
  > = new Map();

  readonly #messageCounter = makeCounter();

  readonly #postMessage: PostMessage<VatWorkerServiceCommand>;

  /**
   * The client end of the vat worker service, intended to be constructed in
   * the kernel worker. Sends launch and terminate worker requests to the
   * server and wraps the launch response in a DuplexStream for consumption
   * by the kernel.
   *
   * @see {@link ExtensionVatWorkerServer} for the other end of the service.
   *
   * @param postMessage - A method for posting a message to the server.
   * @param addListener - A method for registering a listener for messages from the server.
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker client]'.
   */
  constructor(
    postMessage: PostMessage<VatWorkerServiceCommand>,
    addListener: AddListener,
    logger?: Logger,
  ) {
    this.#postMessage = postMessage;
    this.#logger = logger ?? makeLogger('[vat worker client]');
    addListener(makeHandledCallback(this.#handleMessage.bind(this)));
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
    this.#postMessage(message);
    return promise;
  }

  async launch(
    vatId: VatId,
  ): Promise<DuplexStream<MultiplexEnvelope, MultiplexEnvelope>> {
    return this.#sendMessage({
      method: VatWorkerServiceCommandMethod.Launch,
      params: { vatId },
    });
  }

  async terminate(vatId: VatId): Promise<undefined> {
    return this.#sendMessage({
      method: VatWorkerServiceCommandMethod.Terminate,
      params: { vatId },
    });
  }

  async terminateAll(): Promise<void> {
    return this.#sendMessage({
      method: VatWorkerServiceCommandMethod.TerminateAll,
      params: null,
    });
  }

  async #handleMessage(event: MessageEvent<unknown>): Promise<void> {
    if (!isVatWorkerServiceCommandReply(event.data)) {
      // This happens when other messages pass through the same channel.
      this.#logger.debug('Received unexpected message', event.data);
      return;
    }

    const { id, payload } = event.data;
    const { method } = payload;
    const port = event.ports.at(0);

    const promise = this.#unresolvedMessages.get(id);

    if (!promise) {
      this.#logger.error('Received unexpected reply', event.data);
      return;
    }

    if (isObject(payload.params) && payload.params.error) {
      promise.reject(unmarshalError(payload.params.error));
      return;
    }

    switch (method) {
      case VatWorkerServiceCommandMethod.Launch:
        if (!port) {
          this.#logger.error('Expected a port with message reply', event);
          return;
        }
        promise.resolve(
          new MessagePortDuplexStream<MultiplexEnvelope, MultiplexEnvelope>(
            port,
            isMultiplexEnvelope,
          ),
        );
        break;
      case VatWorkerServiceCommandMethod.Terminate:
      case VatWorkerServiceCommandMethod.TerminateAll:
        // If we were caching streams on the client this would be a good place
        // to remove them.
        promise.resolve(undefined);
        break;
      /* v8 ignore next 6: Not known to be possible. */
      default:
        this.#logger.error(
          'Received message with unexpected method',
          // @ts-expect-error Runtime does not respect "never".
          method.valueOf(),
        );
    }
  }
}
harden(ExtensionVatWorkerClient);
