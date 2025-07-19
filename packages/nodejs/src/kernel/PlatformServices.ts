import { makePromiseKit } from '@endo/promise-kit';
import type { RemoteComms } from '@metamask/kernel-browser-runtime';
import { initRemoteComms } from '@metamask/kernel-browser-runtime';
import { isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type {
  PlatformServices,
  VatId,
  RemoteMessageHandler,
} from '@metamask/ocap-kernel';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import type { DuplexStream } from '@metamask/streams';
import { Worker as NodeWorker } from 'node:worker_threads';

// Worker file loads from the built dist directory, requires rebuild after change
// Note: Worker runs in same process and may be subject to spectre-style attacks
const DEFAULT_WORKER_FILE = new URL(
  '../../dist/vat/vat-worker.mjs',
  import.meta.url,
).pathname;

export class NodejsPlatformServices implements PlatformServices {
  readonly #logger: Logger;

  #remoteComms: RemoteComms | null = null;

  #remoteMessageHandler: RemoteMessageHandler | undefined = undefined;

  readonly #workerFilePath: string;

  workers = new Map<
    VatId,
    { worker: NodeWorker; stream: DuplexStream<JsonRpcMessage, JsonRpcMessage> }
  >();

  /**
   * The vat worker service, intended to be constructed in
   * the kernel worker.
   *
   * @param args - A bag of optional arguments.
   * @param args.workerFilePath - An optional path to a file defining the worker's routine. Defaults to 'vat-worker.mjs'.
   * @param args.logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker client]'.
   */
  constructor(args: {
    workerFilePath?: string | undefined;
    logger?: Logger | undefined;
  }) {
    this.#workerFilePath = args.workerFilePath ?? DEFAULT_WORKER_FILE;
    this.#logger = args.logger ?? new Logger('vat-worker-service');
  }

  async launch(
    vatId: VatId,
  ): Promise<DuplexStream<JsonRpcMessage, JsonRpcMessage>> {
    this.#logger.debug('launching vat', vatId);
    const { promise, resolve, reject } =
      makePromiseKit<DuplexStream<JsonRpcMessage, JsonRpcMessage>>();
    const worker = new NodeWorker(this.#workerFilePath, {
      env: {
        NODE_VAT_ID: vatId,
      },
    });
    worker.once('online', () => {
      const stream = new NodeWorkerDuplexStream<JsonRpcMessage, JsonRpcMessage>(
        worker,
        isJsonRpcMessage,
      );
      this.workers.set(vatId, { worker, stream });
      stream
        .synchronize()
        .then(() => {
          resolve(stream);
          this.#logger.debug('connected to kernel');
          return undefined;
        })
        .catch((error) => {
          reject(error);
        });
    });
    return promise;
  }

  async terminate(vatId: VatId): Promise<undefined> {
    const workerEntry = this.workers.get(vatId);
    assert(workerEntry, `No worker found for vatId ${vatId}`);
    const { worker, stream } = workerEntry;
    await stream.return();
    await worker.terminate();
    this.workers.delete(vatId);
    return undefined;
  }

  async terminateAll(): Promise<void> {
    for (const vatId of this.workers.keys()) {
      await this.terminate(vatId);
    }
  }

  async sendRemoteMessage(from: string, message: string): Promise<void> {
    if (!this.#remoteComms) {
      throw Error('remote comms not initialized');
    }
    await this.#remoteComms.sendRemoteMessage(from, message);
  }

  async #handleRemoteMessage(from: string, message: string): Promise<string> {
    if (!this.#remoteMessageHandler) {
      // This can't actually happen, but TypeScript can't infer it
      throw Error('remote comms not initialized');
    }
    const possibleReply = await this.#remoteMessageHandler(from, message);
    if (possibleReply !== '') {
      await this.sendRemoteMessage(from, possibleReply);
    }
    return '';
  }

  async initializeRemoteComms(
    keySeed: string,
    knownRelays: string[],
    remoteMessageHandler: (from: string, message: string) => Promise<string>,
  ): Promise<void> {
    if (this.#remoteComms) {
      throw Error('remote comms already initialized');
    }
    this.#remoteMessageHandler = remoteMessageHandler;
    this.#remoteComms = await initRemoteComms(
      keySeed,
      knownRelays,
      this.#handleRemoteMessage.bind(this),
    );
  }
}
harden(NodejsPlatformServices);
