import { makePromiseKit } from '@endo/promise-kit';
import { isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type {
  PlatformServices,
  VatId,
  RemoteMessageHandler,
  SendRemoteMessage,
  StopRemoteComms,
} from '@metamask/ocap-kernel';
import { initNetwork } from '@metamask/ocap-kernel';
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

  #sendRemoteMessageFunc: SendRemoteMessage | null = null;

  #stopRemoteCommsFunc: StopRemoteComms | null = null;

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
    console.log('[PLATFORMSERVICES] Launching vat', vatId);

    // Check if worker already exists
    if (this.workers.has(vatId)) {
      const error = new Error(
        `Worker ${vatId} already exists! Cannot launch duplicate.`,
      );
      console.error('[PLATFORMSERVICES]', error.message);
      throw error;
    }

    this.#logger.debug('launching vat', vatId);
    const { promise, resolve, reject } =
      makePromiseKit<DuplexStream<JsonRpcMessage, JsonRpcMessage>>();

    // Set a timeout to detect hung worker initialization
    const timeout = setTimeout(() => {
      console.error('[PLATFORMSERVICES] Worker startup timeout!', vatId);
      reject(new Error(`Worker ${vatId} failed to start within 30 seconds`));
    }, 30000);

    console.log('[PLATFORMSERVICES] Creating new worker thread for', vatId);
    const worker = new NodeWorker(this.#workerFilePath, {
      env: {
        NODE_VAT_ID: vatId,
      },
    });
    console.log('[PLATFORMSERVICES] Worker thread created', vatId);

    // Handle worker errors during startup
    worker.once('error', (error) => {
      console.error(
        '[PLATFORMSERVICES] Worker error during startup!',
        vatId,
        error,
      );
      clearTimeout(timeout);
      reject(
        new Error(`Worker ${vatId} errored during startup: ${error.message}`),
      );
    });

    // Handle worker exit during startup
    worker.once('exit', (code) => {
      console.error(
        '[PLATFORMSERVICES] Worker exited during startup!',
        vatId,
        'code:',
        code,
      );
      clearTimeout(timeout);
      reject(
        new Error(`Worker ${vatId} exited during startup with code ${code}`),
      );
    });

    worker.once('online', () => {
      console.log('[PLATFORMSERVICES] Worker online event received!', vatId);
      clearTimeout(timeout);

      // Remove error and exit listeners now that worker is online
      worker.removeAllListeners('error');
      worker.removeAllListeners('exit');

      const stream = new NodeWorkerDuplexStream<JsonRpcMessage, JsonRpcMessage>(
        worker,
        isJsonRpcMessage,
      );
      console.log('[PLATFORMSERVICES] Stream created', vatId);
      this.workers.set(vatId, { worker, stream });
      console.log(
        '[PLATFORMSERVICES] Worker added to map, starting synchronization',
        vatId,
      );
      stream
        .synchronize()
        .then(() => {
          console.log('[PLATFORMSERVICES] Stream synchronized!', vatId);
          resolve(stream);
          console.log('[PLATFORMSERVICES] Worker connected to kernel', vatId);
          this.#logger.debug('connected to kernel');
          return undefined;
        })
        .catch((error) => {
          console.error(
            '[PLATFORMSERVICES] Stream synchronization failed',
            vatId,
            error,
          );
          reject(error);
        });
    });
    console.log(
      '[PLATFORMSERVICES] Worker promise created, waiting for online event',
      vatId,
    );
    return promise;
  }

  async terminate(vatId: VatId): Promise<undefined> {
    console.log('[PLATFORMSERVICES] Terminating worker', vatId);
    const workerEntry = this.workers.get(vatId);
    assert(workerEntry, `No worker found for vatId ${vatId}`);
    const { worker, stream } = workerEntry;

    // Remove from map first to prevent reuse
    this.workers.delete(vatId);
    console.log('[PLATFORMSERVICES] Worker removed from map', vatId);

    console.log('[PLATFORMSERVICES] Returning stream', vatId);
    try {
      await stream.return();
      console.log('[PLATFORMSERVICES] Stream returned', vatId);
    } catch (error) {
      console.error('[PLATFORMSERVICES] Error returning stream', vatId, error);
    }

    console.log('[PLATFORMSERVICES] Terminating worker thread', vatId);
    try {
      // Remove all listeners to prevent interference with new workers
      worker.removeAllListeners();
      console.log('[PLATFORMSERVICES] Worker listeners removed', vatId);

      await worker.terminate();
      console.log('[PLATFORMSERVICES] Worker thread terminated', vatId);
    } catch (error) {
      console.error(
        '[PLATFORMSERVICES] Error terminating worker',
        vatId,
        error,
      );
    }

    console.log('[PLATFORMSERVICES] Worker fully terminated', vatId);
    return undefined;
  }

  async terminateAll(): Promise<void> {
    console.log(
      '[PLATFORMSERVICES] Terminating all workers, count:',
      this.workers.size,
    );
    const vatIds = Array.from(this.workers.keys());
    for (const vatId of vatIds) {
      try {
        await this.terminate(vatId);
      } catch (error) {
        console.error(
          '[PLATFORMSERVICES] Error terminating worker',
          vatId,
          error,
        );
        // Continue with other workers
      }
    }
    console.log('[PLATFORMSERVICES] All workers terminated');

    // Give Node.js event loop a moment to clean up resources
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('[PLATFORMSERVICES] Cleanup delay complete');
  }

  async sendRemoteMessage(
    to: string,
    message: string,
    hints: string[] = [],
  ): Promise<void> {
    if (!this.#sendRemoteMessageFunc) {
      throw Error('remote comms not initialized');
    }
    await this.#sendRemoteMessageFunc(to, message, hints);
  }

  async #handleRemoteMessage(from: string, message: string): Promise<string> {
    if (!this.#remoteMessageHandler) {
      // This can't actually happen, but TypeScript can't infer it
      throw Error('remote comms not initialized');
    }
    const possibleReply = await this.#remoteMessageHandler(from, message);
    if (possibleReply !== '') {
      await this.sendRemoteMessage(from, possibleReply, []);
    }
    return '';
  }

  async initializeRemoteComms(
    keySeed: string,
    knownRelays: string[],
    remoteMessageHandler: (from: string, message: string) => Promise<string>,
  ): Promise<void> {
    if (this.#sendRemoteMessageFunc) {
      throw Error('remote comms already initialized');
    }
    this.#remoteMessageHandler = remoteMessageHandler;
    const { sendRemoteMessage, stop } = await initNetwork(
      keySeed,
      knownRelays,
      this.#handleRemoteMessage.bind(this),
    );
    this.#sendRemoteMessageFunc = sendRemoteMessage;
    this.#stopRemoteCommsFunc = stop;
  }

  async stopRemoteComms(): Promise<void> {
    console.log('[PLATFORMSERVICES] Stopping remote comms');
    if (!this.#stopRemoteCommsFunc) {
      console.log('[PLATFORMSERVICES] No remote comms to stop');
      return;
    }
    console.log('[PLATFORMSERVICES] Calling remote comms stop function');
    await this.#stopRemoteCommsFunc();
    console.log('[PLATFORMSERVICES] Remote comms stop function completed');
    this.#sendRemoteMessageFunc = null;
    this.#stopRemoteCommsFunc = null;
    console.log('[PLATFORMSERVICES] Remote comms stopped');
  }
}
harden(NodejsPlatformServices);
