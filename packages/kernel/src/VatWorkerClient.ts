import { makePromiseKit } from '@endo/promise-kit';
import type { DuplexStream } from '@ocap/streams';
import { MessagePortDuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeCounter, makeHandledCallback, makeLogger } from '@ocap/utils';

import type { StreamEnvelope, StreamEnvelopeReply } from './stream-envelope.js';
import type { PromiseCallbacks, VatId } from './types.js';
import type { AddListener } from './vat-worker-service.js';
import {
  isVatWorkerServiceMessage,
  VatWorkerServiceMethod,
} from './vat-worker-service.js';
// Appears in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { VatWorkerServer } from './VatWorkerServer.js';

export class VatWorkerClient {
  readonly #logger: Logger;

  readonly #unresolvedMessages: Map<number, PromiseCallbacks> = new Map();

  readonly #messageCounter = makeCounter();

  readonly #postMessage: (message: unknown) => void;

  /**
   * The client end of the vat worker service, intended to be constructed in
   * the kernel worker. Sends initWorker and deleteWorker requests to the
   * server and wraps the initWorker response in a DuplexStream for consumption
   * by the kernel.
   *
   * @see {@link VatWorkerServer} for the other end of the service.
   *
   * @param postMessage - A method for posting a message to the server.
   * @param addListener - A method for registering a listener for messages from the server.
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker client]'.
   */
  constructor(
    postMessage: (message: unknown) => void,
    addListener: AddListener,
    logger?: Logger,
  ) {
    this.#postMessage = postMessage;
    this.#logger = logger ?? makeLogger('[vat worker client]');
    addListener(makeHandledCallback(this.#handleMessage.bind(this)));
  }

  async #sendMessage<Return>(
    method:
      | typeof VatWorkerServiceMethod.Init
      | typeof VatWorkerServiceMethod.Delete,
    vatId: VatId,
  ): Promise<Return> {
    const message = {
      id: this.#messageCounter(),
      method,
      vatId,
    };
    const { promise, resolve, reject } = makePromiseKit<Return>();
    this.#unresolvedMessages.set(message.id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    this.#postMessage(message);
    return promise;
  }

  async initWorker(
    vatId: VatId,
  ): Promise<DuplexStream<StreamEnvelopeReply, StreamEnvelope>> {
    return this.#sendMessage(VatWorkerServiceMethod.Init, vatId);
  }

  async deleteWorker(vatId: VatId): Promise<undefined> {
    return this.#sendMessage(VatWorkerServiceMethod.Delete, vatId);
  }

  async #handleMessage(event: MessageEvent<unknown>): Promise<void> {
    if (!isVatWorkerServiceMessage(event.data)) {
      // This happens when other messages pass through the same channel.
      this.#logger.debug('Received unexpected message', event.data);
      return;
    }

    const { id, method, error } = event.data;
    const port = event.ports.at(0);

    const promise = this.#unresolvedMessages.get(id);

    if (!promise) {
      this.#logger.error('Received unexpected reply', event.data);
      return;
    }

    if (error) {
      promise.reject(error);
      return;
    }

    switch (method) {
      case VatWorkerServiceMethod.Init:
        if (!port) {
          this.#logger.error('Expected a port with message reply', event);
          return;
        }
        promise.resolve(
          new MessagePortDuplexStream<StreamEnvelope, StreamEnvelopeReply>(
            port,
          ),
        );
        break;
      case VatWorkerServiceMethod.Delete:
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
harden(VatWorkerClient);
