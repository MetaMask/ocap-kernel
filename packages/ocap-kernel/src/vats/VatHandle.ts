import type { VatSyscallObject } from '@agoric/swingset-liveslots';
import { VatDeletedError, StreamReadError } from '@metamask/kernel-errors';
import { RpcClient, RpcService } from '@metamask/kernel-rpc-methods';
import type {
  ExtractParams,
  ExtractResult,
} from '@metamask/kernel-rpc-methods';
import type { VatStore } from '@metamask/kernel-store';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { DuplexStream } from '@metamask/streams';
import { isJsonRpcNotification, isJsonRpcResponse } from '@metamask/utils';
import type { JsonRpcNotification, JsonRpcResponse } from '@metamask/utils';

import type { KernelQueue } from '../KernelQueue.ts';
import { kser } from '../liveslots/kernel-marshal.ts';
import { vatMethodSpecs, vatSyscallHandlers } from '../rpc/index.ts';
import type { PingVatResult, VatMethod } from '../rpc/index.ts';
import type { KernelStore } from '../store/index.ts';
import type { VatId, VatConfig, VatDeliveryResult } from '../types.ts';
import { BaseVatHandle } from './BaseVatHandle.ts';
import type { DeliveryObject } from './BaseVatHandle.ts';
import { VatSyscall } from './VatSyscall.ts';

type MessageFromVat = JsonRpcResponse | JsonRpcNotification;

type VatStream = DuplexStream<MessageFromVat, JsonRpcMessage>;

type VatConstructorProps = {
  vatId: VatId;
  vatConfig: VatConfig;
  vatStream: VatStream;
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  logger?: Logger | undefined;
};

/**
 * Handles communication with and lifecycle management of a vat.
 */
export class VatHandle extends BaseVatHandle {
  /** The ID of the vat this is the VatHandle for */
  readonly vatId: VatId;

  /** Communications channel to and from the vat itself */
  readonly #vatStream: VatStream;

  /** The vat's configuration */
  readonly config: VatConfig;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger | undefined;

  /** Storage holding the kernel's persistent state */
  readonly #kernelStore: KernelStore;

  /** Storage holding this vat's persistent state */
  readonly #vatStore: VatStore;

  /** The kernel's queue */
  readonly #kernelQueue: KernelQueue;

  readonly #rpcClient: RpcClient<typeof vatMethodSpecs>;

  readonly #rpcService: RpcService<typeof vatSyscallHandlers>;

  /**
   * Construct a new VatHandle instance.
   *
   * @param params - Named constructor parameters.
   * @param params.vatId - Our vat ID.
   * @param params.vatConfig - The configuration for this vat.
   * @param params.vatStream - Communications channel connected to the vat worker.
   * @param params.kernelStore - The kernel's persistent state store.
   * @param params.kernelQueue - The kernel's queue.
   * @param params.logger - Optional logger for error and diagnostic output.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor({
    vatId,
    vatConfig,
    vatStream,
    kernelStore,
    kernelQueue,
    logger,
  }: VatConstructorProps) {
    const vatSyscall = new VatSyscall({
      vatId,
      kernelQueue,
      kernelStore,
      isActive: () => kernelStore.isVatActive(vatId),
      logger: logger?.subLogger({ tags: ['syscall'] }),
    });

    super(vatSyscall);

    this.vatId = vatId;
    this.config = vatConfig;
    this.#logger = logger;
    this.#vatStream = vatStream;
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#vatStore = kernelStore.makeVatStore(vatId);
    this.#rpcClient = new RpcClient(
      vatMethodSpecs,
      async (request) => {
        await vatStream.write(request);
      },
      `${vatId}:`,
    );
    this.#rpcService = new RpcService(vatSyscallHandlers, {
      handleSyscall: (params) => {
        this.vatSyscall.handleSyscall(params as VatSyscallObject);
      },
    });

    // Set up deliver function for BaseVatHandle
    this.deliver = async (delivery: DeliveryObject): Promise<string | null> => {
      const [, deliveryError] = await this.sendVatCommand({
        method: 'deliver',
        params: delivery,
      });
      return deliveryError;
    };
  }

  /**
   * Create a new VatHandle instance.
   *
   * @param params - Named constructor parameters.
   * @param params.vatId - Our vat ID.
   * @param params.vatConfig - The configuration for this vat.
   * @param params.vatStream - Communications channel connected to the vat worker.
   * @param params.kernelStore - The kernel's persistent state store.
   * @param params.kernelQueue - The kernel's queue.
   * @param params.logger - Optional logger for error and diagnostic output.
   * @returns A promise for the new VatHandle instance.
   */
  static async make(params: VatConstructorProps): Promise<VatHandle> {
    const vat = new VatHandle(params);
    const [, deliveryError] = await vat.#init();
    if (deliveryError) {
      throw new Error(
        `Failed to initialize vat ${vat.vatId}: ${deliveryError}`,
      );
    }
    return vat;
  }

  /**
   * Initializes the vat.
   *
   * @returns A promise for the vat's initial delivery result.
   */
  async #init(): Promise<VatDeliveryResult> {
    Promise.all([this.#vatStream.drain(this.#handleMessage.bind(this))]).catch(
      async (error) => {
        this.#logger?.error(`Unexpected read error`, error);
        await this.terminate(
          true,
          new StreamReadError({ vatId: this.vatId }, error),
        );
      },
    );

    return await this.sendVatCommand({
      method: 'initVat',
      params: {
        vatConfig: this.config,
        state: this.#vatStore.getKVData(),
      },
    });
  }

  /**
   * Ping the vat.
   *
   * @returns A promise that resolves to the result of the ping.
   */
  async ping(): Promise<PingVatResult> {
    return await this.sendVatCommand({
      method: 'ping',
      params: [],
    });
  }

  /**
   * Handle a message from the vat.
   *
   * @param message - The message to handle.
   * @param message.id - The id of the message.
   * @param message.payload - The payload (i.e., the message itself) to handle.
   */
  async #handleMessage(message: JsonRpcMessage): Promise<void> {
    if (isJsonRpcResponse(message)) {
      this.#rpcClient.handleResponse(message.id as string, message);
    } else if (isJsonRpcNotification(message)) {
      this.#rpcService.assertHasMethod(message.method);
      await this.#rpcService.execute(message.method, message.params);
    } else {
      // We don't expect any JSON-RPC requests from the vat, but the stream may permit them
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Received unexpected message: ${message}`);
    }
  }

  /**
   * Terminates the vat.
   *
   * @param terminating - If true, the vat is being killed permanently, so clean
   *   up its state and reject any promises that would be left dangling.
   * @param error - The error to terminate the vat with.
   */
  async terminate(terminating: boolean, error?: Error): Promise<void> {
    await this.#vatStream.end(error);
    const terminationError = error ?? new VatDeletedError(this.vatId);
    if (terminating) {
      // Reject promises exported to other vats for which this vat is the decider
      const failure = kser(terminationError);
      for (const kpid of this.#kernelStore.getPromisesByDecider(this.vatId)) {
        this.#kernelQueue.resolvePromises(this.vatId, [[kpid, true, failure]]);
      }
      this.#rpcClient.rejectAll(terminationError);
      this.#kernelStore.deleteVat(this.vatId);
    }
  }

  /**
   * Send a command into the vat.
   *
   * @param payload - The payload of the command.
   * @param payload.method - The method to call.
   * @param payload.params - The parameters to pass to the method.
   * @returns A promise that resolves the response to the command.
   */
  async sendVatCommand<Method extends VatMethod>({
    method,
    params,
  }: {
    method: Method;
    params: ExtractParams<Method, typeof vatMethodSpecs>;
  }): Promise<ExtractResult<Method, typeof vatMethodSpecs>> {
    const result = await this.#rpcClient.call(method, params);
    if (method === 'deliver' || method === 'initVat') {
      const [[sets, deletes], deliveryError] = result as VatDeliveryResult;
      const noErrors = !deliveryError && !this.vatSyscall.illegalSyscall;
      // On errors, we neither update this vat's KV data nor rollback previous changes.
      // This is safe because vats are always terminated when errors occur
      // and they have their own databases, which are deleted when the vat is terminated.
      // The main kernel database will be rolled back.
      if (noErrors) {
        this.#vatStore.updateKVData(sets, deletes);
      }
    }
    return result;
  }
}
