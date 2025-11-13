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
import { strict as assert } from 'node:assert';
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

  #closeConnectionFunc: ((peerId: string) => Promise<void>) | null = null;

  #reconnectPeerFunc:
    | ((peerId: string, hints?: string[]) => Promise<void>)
    | null = null;

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

  /**
   * Launch a new worker with a specific vat id.
   *
   * @param vatId - The vat id of the worker to launch.
   * @returns A promise for a duplex stream connected to the worker
   * which rejects if a worker with the given vat id already exists.
   */
  async launch(
    vatId: VatId,
  ): Promise<DuplexStream<JsonRpcMessage, JsonRpcMessage>> {
    // Check if worker already exists
    if (this.workers.has(vatId)) {
      throw new Error(
        `Worker ${vatId} already exists! Cannot launch duplicate.`,
      );
    }

    this.#logger.debug('launching vat', vatId);
    const { promise, resolve, reject } =
      makePromiseKit<DuplexStream<JsonRpcMessage, JsonRpcMessage>>();

    const worker = new NodeWorker(this.#workerFilePath, {
      env: {
        NODE_VAT_ID: vatId,
      },
    });

    // Handle worker errors before 'online' event
    worker.once('error', (error) => {
      worker.removeAllListeners();
      // eslint-disable-next-line promise/no-promise-in-callback
      worker.terminate().catch(() => {
        // Ignore termination errors
      });
      reject(
        new Error(`Worker ${vatId} errored during startup: ${error.message}`),
      );
    });

    // Handle worker exit before 'online' event
    worker.once('exit', (code) => {
      worker.removeAllListeners();
      reject(
        new Error(`Worker ${vatId} exited during startup with code ${code}`),
      );
    });

    worker.once('online', () => {
      // Remove error and exit listeners now that worker is online
      worker.removeAllListeners('error');
      worker.removeAllListeners('exit');

      const stream = new NodeWorkerDuplexStream<JsonRpcMessage, JsonRpcMessage>(
        worker,
        isJsonRpcMessage,
      );
      stream
        .synchronize()
        .then(() => {
          // Only add worker to map after successful synchronization
          this.workers.set(vatId, { worker, stream });
          resolve(stream);
          this.#logger.debug('connected to kernel');
          return undefined;
        })
        .catch(async (error) => {
          // Clean up worker if synchronization fails
          worker.removeAllListeners();
          try {
            await worker.terminate();
          } catch (terminateError) {
            this.#logger.error(
              `Error terminating worker ${vatId} after sync failure`,
              terminateError,
            );
          }
          reject(error);
        });
    });
    return promise;
  }

  /**
   * Terminate a worker identified by its vat id.
   *
   * @param vatId - The vat id of the worker to terminate.
   * @returns A promise that resolves when the worker has terminated
   * or rejects if that worker does not exist.
   */
  async terminate(vatId: VatId): Promise<undefined> {
    const workerEntry = this.workers.get(vatId);
    assert(workerEntry, `No worker found for vatId ${vatId}`);
    const { worker, stream } = workerEntry;
    await stream.return();
    worker.removeAllListeners();
    await worker.terminate();
    this.workers.delete(vatId);
    return undefined;
  }

  /**
   * Terminate all workers managed by the service.
   *
   * @returns A promise that resolves after all workers have terminated
   * or rejects if there was an error during termination.
   */
  async terminateAll(): Promise<void> {
    const vatIds = Array.from(this.workers.keys());
    for (const vatId of vatIds) {
      try {
        await this.terminate(vatId);
      } catch (error) {
        this.#logger.error('Error terminating worker', vatId, error);
      }
    }
  }

  /**
   * Send a remote message to a peer.
   *
   * @param to - The peer ID to send the message to.
   * @param message - The message to send.
   * @param hints - Optional hints for the message.
   * @returns A promise that resolves when the message has been sent.
   */
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

  /**
   * Handle a remote message from a peer.
   *
   * @param from - The peer ID that sent the message.
   * @param message - The message received.
   * @returns A promise that resolves with the reply message, or an empty string if no reply is needed.
   */
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

  /**
   * Initialize network communications.
   *
   * @param keySeed - The seed for generating this kernel's secret key.
   * @param knownRelays - Array of the peerIDs of relay nodes that can be used to listen for incoming
   *   connections from other kernels.
   * @param remoteMessageHandler - A handler function to receive remote messages.
   * @returns A promise that resolves once network access has been established
   *   or rejects if there is some problem doing so.
   */
  async initializeRemoteComms(
    keySeed: string,
    knownRelays: string[],
    remoteMessageHandler: (from: string, message: string) => Promise<string>,
  ): Promise<void> {
    if (this.#sendRemoteMessageFunc) {
      throw Error('remote comms already initialized');
    }
    this.#remoteMessageHandler = remoteMessageHandler;
    const { sendRemoteMessage, stop, closeConnection, reconnectPeer } =
      await initNetwork(
        keySeed,
        knownRelays,
        this.#handleRemoteMessage.bind(this),
      );
    this.#sendRemoteMessageFunc = sendRemoteMessage;
    this.#stopRemoteCommsFunc = stop;
    this.#closeConnectionFunc = closeConnection;
    this.#reconnectPeerFunc = reconnectPeer;
  }

  /**
   * Stop network communications.
   *
   * @returns A promise that resolves when network access has been stopped
   *   or rejects if there is some problem doing so.
   */
  async stopRemoteComms(): Promise<void> {
    if (!this.#stopRemoteCommsFunc) {
      return;
    }
    await this.#stopRemoteCommsFunc();
    this.#sendRemoteMessageFunc = null;
    this.#stopRemoteCommsFunc = null;
    this.#closeConnectionFunc = null;
    this.#reconnectPeerFunc = null;
  }

  /**
   * Explicitly close a connection to a peer.
   * Marks the peer as intentionally closed to prevent automatic reconnection.
   *
   * @param peerId - The peer ID to close the connection for.
   * @returns A promise that resolves when the connection is closed.
   */
  async closeConnection(peerId: string): Promise<void> {
    if (!this.#closeConnectionFunc) {
      throw Error('remote comms not initialized');
    }
    await this.#closeConnectionFunc(peerId);
  }

  /**
   * Manually reconnect to a peer after intentional close.
   * Clears the intentional close flag and initiates reconnection.
   *
   * @param peerId - The peer ID to reconnect to.
   * @param hints - Optional hints for reconnection.
   * @returns A promise that resolves when reconnection is initiated.
   */
  async reconnectPeer(peerId: string, hints: string[] = []): Promise<void> {
    if (!this.#reconnectPeerFunc) {
      throw Error('remote comms not initialized');
    }
    await this.#reconnectPeerFunc(peerId, hints);
  }
}
harden(NodejsPlatformServices);
