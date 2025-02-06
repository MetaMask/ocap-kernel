import { makePromiseKit } from '@endo/promise-kit';
import { isVatCommandReply } from '@ocap/kernel';
import type {
  VatWorkerService,
  VatId,
  VatCommand,
  VatCommandReply,
} from '@ocap/kernel';
import { NodeWorkerDuplexStream } from '@ocap/streams';
import type { DuplexStream } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';
import type { Logger } from '@ocap/utils';
import { Worker as NodeWorker } from 'node:worker_threads';

// Worker file loads from the built dist directory, requires rebuild after change
// Note: Worker runs in same process and may be subject to spectre-style attacks
const DEFAULT_WORKER_FILE = new URL(
  '../../dist/vat/vat-worker.mjs',
  import.meta.url,
).pathname;

export class NodejsVatWorkerService implements VatWorkerService {
  readonly #logger: Logger;

  readonly #workerFilePath: string;

  workers = new Map<
    VatId,
    { worker: NodeWorker; stream: DuplexStream<VatCommandReply, VatCommand> }
  >();

  /**
   * The vat worker service, intended to be constructed in
   * the kernel worker.
   *
   * @param args - A bag of optional arguments.
   * @param args.workerFilePath - An optional path to a file defining the worker's routine. Defaults to 'vat-worker.mjs'.
   * @param args.logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker client]'.
   */
  constructor(args: { workerFilePath?: string; logger?: Logger }) {
    this.#workerFilePath = args.workerFilePath ?? DEFAULT_WORKER_FILE;
    this.#logger = args.logger ?? makeLogger('[vat worker service]');
  }

  async launch(
    vatId: VatId,
  ): Promise<DuplexStream<VatCommandReply, VatCommand>> {
    this.#logger.debug('launching vat', vatId);
    const { promise, resolve, reject } =
      makePromiseKit<DuplexStream<VatCommandReply, VatCommand>>();
    const worker = new NodeWorker(this.#workerFilePath, {
      env: {
        NODE_VAT_ID: vatId,
      },
    });
    worker.once('online', () => {
      const stream = new NodeWorkerDuplexStream<VatCommandReply, VatCommand>(
        worker,
        isVatCommandReply,
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
}
harden(NodejsVatWorkerService);
