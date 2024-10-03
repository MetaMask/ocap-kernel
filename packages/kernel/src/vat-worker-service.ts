// Vat worker service.

import { makePromiseKit } from '@endo/promise-kit';
import { isObject } from '@metamask/utils';
import type { DuplexStream } from '@ocap/streams';
import { MessagePortDuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeCounter, makeHandledCallback, makeLogger } from '@ocap/utils';

import type { StreamEnvelope, StreamEnvelopeReply } from './stream-envelope.js';
import type { PromiseCallbacks, VatId } from './types.js';

export const SERVICE_TYPE_CREATE = 'iframe-vat-worker-create';
export const SERVICE_TYPE_DELETE = 'iframe-vat-worker-delete';

type MessageId = number;

export type VatWorker = {
  init: () => Promise<[MessagePort, unknown]>;
  delete: () => Promise<void>;
};

type VatWorkerServiceMessage = {
  method: typeof SERVICE_TYPE_CREATE | typeof SERVICE_TYPE_DELETE;
  id: MessageId;
  vatId: VatId;
  error?: Error;
};

const isVatWorkerServiceMessage = (
  value: unknown,
): value is VatWorkerServiceMessage =>
  isObject(value) &&
  typeof value.id === 'number' &&
  (value.method === SERVICE_TYPE_CREATE ||
    value.method === SERVICE_TYPE_DELETE) &&
  typeof value.vatId === 'string';

type PostMessage = (message: unknown, transfer?: Transferable[]) => void;
type AddListener = (listener: (event: MessageEvent<unknown>) => void) => void;

/**
 * To be constructed in the offscreen document.
 */
export class VatWorkerServer {
  readonly #logger;

  readonly #vatWorkers: Map<VatId, VatWorker> = new Map();

  readonly #postMessage: PostMessage;

  readonly #addListener: AddListener;

  readonly #makeWorker: (vatId: VatId) => VatWorker;

  #running = false;

  constructor(
    postMessage: PostMessage,
    addListener: (listener: (event: MessageEvent<unknown>) => void) => void,
    makeWorker: (vatId: VatId) => VatWorker,
    logger?: Logger,
  ) {
    this.#postMessage = postMessage;
    this.#addListener = addListener;
    this.#makeWorker = makeWorker;
    this.#logger = logger ?? makeLogger('[vat worker server]');
  }

  start(): void {
    if (this.#running) {
      throw new Error('VatWorkerServer already running.');
    }
    this.#addListener(makeHandledCallback(this.#handleMessage.bind(this)));
    this.#running = true;
  }

  /*
  stop() {
    // Why would we?
    this.#removeListener(this.#listener);
  }
  */

  async #handleMessage(event: MessageEvent<unknown>): Promise<void> {
    if (!isVatWorkerServiceMessage(event.data)) {
      // This happens when other messages pass through the same channel.
      this.#logger.debug('Received unexpected message', event.data);
      return;
    }

    const { method, id, vatId } = event.data;

    switch (method) {
      case SERVICE_TYPE_CREATE:
        await this.#initVatWorker(vatId)
          .then((port) => this.#postMessage({ method, id, vatId }, [port]))
          .catch((problem: Error) => {
            this.#logger.error(problem.message);
            this.#postMessage({ method, id, vatId, error: problem });
          });
        break;
      case SERVICE_TYPE_DELETE:
        await this.#deleteVatWorker(vatId)
          .then(() => this.#postMessage({ method, id, vatId }))
          .catch((problem: Error) => {
            this.#logger.error(problem.message);
            this.#postMessage({ method, id, vatId, error: problem });
          });
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

  async #initVatWorker(vatId: VatId): Promise<MessagePort> {
    if (this.#vatWorkers.has(vatId)) {
      throw new Error(`Worker for vat ${vatId} already exists.`);
    }
    const vatWorker = this.#makeWorker(vatId);
    const [port] = await vatWorker.init();
    this.#vatWorkers.set(vatId, vatWorker);
    return port;
  }

  async #deleteVatWorker(vatId: VatId): Promise<void> {
    const vatWorker = this.#vatWorkers.get(vatId);
    if (!vatWorker) {
      throw new Error(`Worker for vat ${vatId} does not exist.`);
    }
    return vatWorker
      .delete()
      .then(() => this.#vatWorkers.delete(vatId))
      .then();
  }
}
harden(VatWorkerServer);

export class VatWorkerClient {
  readonly #logger: Logger;

  readonly #unresolvedMessages: Map<number, PromiseCallbacks> = new Map();

  readonly #messageCounter = makeCounter();

  readonly #postMessage: (message: unknown) => void;

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
    method: typeof SERVICE_TYPE_CREATE | typeof SERVICE_TYPE_DELETE,
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
    return this.#sendMessage(SERVICE_TYPE_CREATE, vatId);
  }

  async deleteWorker(vatId: VatId): Promise<undefined> {
    return this.#sendMessage(SERVICE_TYPE_DELETE, vatId);
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
    } else if (error) {
      promise.reject(error);
      return;
    }

    switch (method) {
      case SERVICE_TYPE_CREATE:
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
      case SERVICE_TYPE_DELETE:
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
