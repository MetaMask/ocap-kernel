import type { Logger } from '@ocap/utils';
import { makeHandledCallback, makeLogger } from '@ocap/utils';

import type { VatId } from './types.js';
import type {
  AddListener,
  PostMessage,
  VatWorker,
} from './vat-worker-service.js';
import {
  isVatWorkerServiceMessage,
  VatWorkerServiceMethod,
} from './vat-worker-service.js';
// Appears in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { VatWorkerClient } from './VatWorkerClient.js';

export class VatWorkerServer {
  readonly #logger;

  readonly #vatWorkers: Map<VatId, VatWorker> = new Map();

  readonly #postMessage: PostMessage;

  readonly #addListener: AddListener;

  readonly #makeWorker: (vatId: VatId) => VatWorker;

  #running = false;

  /**
   * The server end of the vat worker service, intended to be constructed in
   * the offscreen document. Listens for initWorker and deleteWorker requests
   * from the client and uses the {@link VatWorker} methods to effect those
   * requests.
   *
   * @see {@link VatWorkerClient} for the other end of the service.
   *
   * @param postMessage - A method for posting a message to the client.
   * @param addListener - A method for registering a listener for messages from the client.
   * @param makeWorker - A method for making a {@link VatWorker}.
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker server]'.
   */
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

  async #handleMessage(event: MessageEvent<unknown>): Promise<void> {
    if (!isVatWorkerServiceMessage(event.data)) {
      // This happens when other messages pass through the same channel.
      this.#logger.debug('Received unexpected message', event.data);
      return;
    }

    const { method, id, vatId } = event.data;

    const handleProblem = async (problem: Error): Promise<void> => {
      this.#logger.error(
        `Error handling ${method} for vatId ${vatId}`,
        problem,
      );
      this.#postMessage({ method, id, vatId, error: problem });
    };

    switch (method) {
      case VatWorkerServiceMethod.Init:
        await this.#initVatWorker(vatId)
          .then((port) => this.#postMessage({ method, id, vatId }, [port]))
          .catch(handleProblem);
        break;
      case VatWorkerServiceMethod.Delete:
        await this.#deleteVatWorker(vatId)
          .then(() => this.#postMessage({ method, id, vatId }))
          .catch(handleProblem);
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
    await vatWorker.delete();
    this.#vatWorkers.delete(vatId);
  }
}
harden(VatWorkerServer);
