import type { VatOneResolution } from '@agoric/swingset-liveslots';
import { serializeError } from '@metamask/rpc-errors';
import { isJsonRpcRequest, isJsonRpcResponse } from '@metamask/utils';
import { VatDeletedError, StreamReadError } from '@ocap/errors';
import { RpcClient, RpcService } from '@ocap/rpc-methods';
import type { ExtractParams, ExtractResult } from '@ocap/rpc-methods';
import type { VatStore } from '@ocap/store';
import type { DuplexStream } from '@ocap/streams';
import type { JsonRpcMessage } from '@ocap/utils';
import { Logger } from '@ocap/utils';

import type { KernelQueue } from './KernelQueue.ts';
import { VatCommandMethod } from './messages/index.ts';
import { vatMethodSpecs, vatSyscallHandlers } from './rpc/index.ts';
import type { VatMethod } from './rpc/index.ts';
import { kser } from './services/kernel-marshal.ts';
import type { KernelStore } from './store/index.ts';
import type {
  Message,
  VatId,
  VatConfig,
  VRef,
  VatCheckpoint,
} from './types.ts';
import { VatSyscall } from './VatSyscall.ts';

type VatConstructorProps = {
  vatId: VatId;
  vatConfig: VatConfig;
  vatStream: DuplexStream<JsonRpcMessage, JsonRpcMessage>;
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  logger?: Logger | undefined;
};

export class VatHandle {
  /** The ID of the vat this is the VatHandle for */
  readonly vatId: VatId;

  /** Communications channel to and from the vat itself */
  readonly #vatStream: DuplexStream<JsonRpcMessage, JsonRpcMessage>;

  /** The vat's configuration */
  readonly config: VatConfig;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger;

  /** Storage holding the kernel's persistent state */
  readonly #kernelStore: KernelStore;

  /** Storage holding this vat's persistent state */
  readonly #vatStore: VatStore;

  /** The vat's syscall */
  readonly #vatSyscall: VatSyscall;

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
    this.vatId = vatId;
    this.config = vatConfig;
    this.#logger = logger ?? new Logger(`[vat ${vatId}]`);
    this.#vatStream = vatStream;
    this.#kernelStore = kernelStore;
    this.#vatStore = kernelStore.makeVatStore(vatId);
    this.#kernelQueue = kernelQueue;
    this.#vatSyscall = new VatSyscall({
      vatId,
      kernelQueue,
      kernelStore,
      logger: this.#logger.subLogger({ tags: ['syscall'] }),
    });

    this.#rpcClient = new RpcClient(
      vatMethodSpecs,
      async (request) => {
        await this.#vatStream.write(request);
      },
      `${this.vatId}:`,
    );
    this.#rpcService = new RpcService(vatSyscallHandlers, {
      handleSyscall: async (params) => {
        await this.#vatSyscall.handleSyscall(params);
        return ['ok', null]; // XXX TODO: Return actual results from syscalls
      },
    });
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
    await vat.#init();
    return vat;
  }

  /**
   * Initializes the vat.
   *
   * @returns A promise that resolves when the vat is initialized.
   */
  async #init(): Promise<void> {
    Promise.all([this.#vatStream.drain(this.#handleMessage.bind(this))]).catch(
      async (error) => {
        this.#logger.error(`Unexpected read error`, error);
        await this.terminate(
          true,
          new StreamReadError({ vatId: this.vatId }, error),
        );
      },
    );

    await this.sendVatCommand({
      method: VatCommandMethod.initVat,
      params: {
        vatConfig: this.config,
        state: Object.fromEntries(this.#vatStore.getKVData()),
      },
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
    } else if (isJsonRpcRequest(message)) {
      try {
        this.#rpcService.assertHasMethod(message.method);
        const result = await this.#rpcService.execute(
          message.method,
          message.params,
        );
        await this.#vatStream.write({
          id: message.id,
          result,
          jsonrpc: '2.0',
        });
      } catch (error) {
        await this.#vatStream.write({
          id: message.id,
          error: serializeError(error),
          jsonrpc: '2.0',
        });
      }
    }
  }

  /**
   * Make a 'message' delivery to the vat.
   *
   * @param target - The VRef of the object to which the message is addressed.
   * @param message - The message to deliver.
   */
  async deliverMessage(target: VRef, message: Message): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['message', target, message],
    });
  }

  /**
   * Make a 'notify' delivery to the vat.
   *
   * @param resolutions - One or more promise resolutions to deliver.
   */
  async deliverNotify(resolutions: VatOneResolution[]): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['notify', resolutions],
    });
  }

  /**
   * Make a 'dropExports' delivery to the vat.
   *
   * @param vrefs - The VRefs of the exports to be dropped.
   */
  async deliverDropExports(vrefs: VRef[]): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['dropExports', vrefs],
    });
  }

  /**
   * Make a 'retireExports' delivery to the vat.
   *
   * @param vrefs - The VRefs of the exports to be retired.
   */
  async deliverRetireExports(vrefs: VRef[]): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['retireExports', vrefs],
    });
  }

  /**
   * Make a 'retireImports' delivery to the vat.
   *
   * @param vrefs - The VRefs of the imports to be retired.
   */
  async deliverRetireImports(vrefs: VRef[]): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['retireImports', vrefs],
    });
  }

  /**
   * Make a 'bringOutYourDead' delivery to the vat.
   */
  async deliverBringOutYourDead(): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['bringOutYourDead'],
    });
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

    if (terminating) {
      // Reject promises exported to other vats for which this vat is the decider
      const failure = kser(new VatDeletedError(this.vatId));
      for (const kpid of this.#kernelStore.getPromisesByDecider(this.vatId)) {
        this.#kernelQueue.resolvePromises(this.vatId, [[kpid, true, failure]]);
      }

      this.#rpcClient.rejectAll(error ?? new VatDeletedError(this.vatId));
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
      // TypeScript fails to narrow the result type on its own
      const [sets, deletes] = result as VatCheckpoint;
      this.#vatStore.updateKVData(
        new Map(Object.entries(sets)),
        new Set(deletes),
      );
    }
    return result;
  }
}
