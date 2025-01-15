import { makePromiseKit } from '@endo/promise-kit';
import type { VatWorkerService, VatId } from '@ocap/kernel';
import { NodeWorkerMultiplexer, StreamMultiplexer } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';
import type { Logger } from '@ocap/utils';
import { Worker as NodeWorker } from 'node:worker_threads';

// Worker file loads from the built dist directory, requires rebuild after change
// Note: Worker runs in same process and may be subject to spectre-style attacks
const workerFileURL = new URL('../../dist/vat/vat-worker.mjs', import.meta.url)
  .pathname;

export class NodejsVatWorkerService implements VatWorkerService {
  readonly #logger: Logger;

  workers = new Map<
    VatId,
    { worker: NodeWorker; multiplexer: StreamMultiplexer }
  >();

  /**
   * The vat worker service, intended to be constructed in
   * the kernel worker.
   *
   * @param logger - An optional {@link Logger}. Defaults to a new logger labeled '[vat worker client]'.
   */
  constructor(logger?: Logger) {
    this.#logger = logger ?? makeLogger('[vat worker service]');
  }

  async launch(vatId: VatId): Promise<StreamMultiplexer> {
    const { promise, resolve } = makePromiseKit<StreamMultiplexer>();
    this.#logger.debug('launching', vatId);
    const worker = new NodeWorker(workerFileURL, {
      env: {
        NODE_VAT_ID: vatId,
      },
    });
    this.#logger.debug('launched', vatId);
    worker.once('online', () => {
      const multiplexer = new NodeWorkerMultiplexer(worker, 'vat');
      this.workers.set(vatId, { worker, multiplexer });
      resolve(multiplexer);
      this.#logger.debug('connected', vatId);
    });
    return promise;
  }

  async terminate(vatId: VatId): Promise<undefined> {
    const workerEntry = this.workers.get(vatId);
    assert(workerEntry, `No worker found for vatId ${vatId}`);
    const { worker, multiplexer } = workerEntry;
    await multiplexer.return();
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
