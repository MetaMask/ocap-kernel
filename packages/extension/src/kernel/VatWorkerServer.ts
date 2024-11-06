import {
  VatAlreadyExistsError,
  VatDeletedError,
  marshalError,
} from '@ocap/errors';
import {
  isVatWorkerServiceCommand,
  VatWorkerServiceCommandMethod,
} from '@ocap/kernel';
import type { VatWorkerServiceCommandReply, VatId } from '@ocap/kernel';
import type { Logger } from '@ocap/utils';
import { makeHandledCallback, makeLogger } from '@ocap/utils';

import type {
  AddListener,
  PostMessage,
  VatWorker,
} from './vat-worker-service.js';
// Appears in the docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ExtensionVatWorkerClient } from './VatWorkerClient.js';

export class ExtensionVatWorkerServer {
  readonly #logger;

  readonly #vatWorkers: Map<VatId, VatWorker> = new Map();

  readonly #postMessage: PostMessage<VatWorkerServiceCommandReply>;

  readonly #addListener: AddListener;

  readonly #makeWorker: (vatId: VatId) => VatWorker;

  #running = false;

  /**
   * The server end of the vat worker service, intended to be constructed in
   * the offscreen document. Listens for launch and terminate worker requests
   * from the client and uses the {@link VatWorker} methods to effect those
   * requests.
   *
   * @see {@link ExtensionVatWorkerClient} for the other end of the service.
   *
   * @param postMessage - A method for posting a message to the client.
   * @param addListener - A method for registering a listener for messages from the client.
   * @param makeWorker - A method for making a {@link VatWorker}.
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker server]'.
   */
  constructor(
    postMessage: PostMessage<VatWorkerServiceCommandReply>,
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
    if (!isVatWorkerServiceCommand(event.data)) {
      // This happens when other messages pass through the same channel.
      this.#logger.debug('Received unexpected message', event.data);
      return;
    }

    const { id, payload } = event.data;
    const { method, params } = payload;

    const handleError = (error: Error, vatId: VatId): void => {
      this.#logger.error(`Error handling ${method} for vatId ${vatId}`, error);
      this.#postMessage({
        id,
        payload: { method, params: { vatId, error: marshalError(error) } },
      });
      throw error;
    };

    switch (method) {
      case VatWorkerServiceCommandMethod.launch:
        await this.#launch(params.vatId)
          .then((port) => this.#postMessage({ id, payload }, [port]))
          .catch(async (error) => handleError(error, params.vatId));
        break;
      case VatWorkerServiceCommandMethod.terminate:
        await this.#terminate(params.vatId)
          .then(() => this.#postMessage({ id, payload }))
          .catch(async (error) => handleError(error, params.vatId));
        break;
      case VatWorkerServiceCommandMethod.terminateAll:
        await Promise.all(
          Array.from(this.#vatWorkers.keys()).map(async (vatId) =>
            this.#terminate(vatId).catch((error) => handleError(error, vatId)),
          ),
        );
        this.#postMessage({ id, payload });
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

  async #launch(vatId: VatId): Promise<MessagePort> {
    if (this.#vatWorkers.has(vatId)) {
      throw new VatAlreadyExistsError(vatId);
    }
    const vatWorker = this.#makeWorker(vatId);
    const [port] = await vatWorker.launch();
    this.#vatWorkers.set(vatId, vatWorker);
    return port;
  }

  async #terminate(vatId: VatId): Promise<void> {
    const vatWorker = this.#vatWorkers.get(vatId);
    if (!vatWorker) {
      throw new VatDeletedError(vatId);
    }
    await vatWorker.terminate();
    this.#vatWorkers.delete(vatId);
  }
}
harden(ExtensionVatWorkerServer);
