import { makeLiveSlots as localMakeLiveSlots } from '@agoric/swingset-liveslots';
import type {
  VatDeliveryObject,
  VatSyscallResult,
} from '@agoric/swingset-liveslots';
import { importBundle } from '@endo/import-bundle';
import { makeMarshal } from '@endo/marshal';
import type { CapData } from '@endo/marshal';
import { StreamReadError } from '@metamask/kernel-errors';
import { RpcClient, RpcService } from '@metamask/kernel-rpc-methods';
import type { VatKVStore } from '@metamask/kernel-store';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import { serializeError } from '@metamask/rpc-errors';
import type { DuplexStream } from '@metamask/streams';
import { isJsonRpcRequest, isJsonRpcResponse } from '@metamask/utils';

import { makeEndowments } from './endowments/index.ts';
import { vatSyscallMethodSpecs, vatHandlers } from './rpc/index.ts';
import { makeGCAndFinalize } from './services/gc-finalize.ts';
import { makeDummyMeterControl } from './services/meter-control.ts';
import { makeSupervisorSyscall } from './services/syscall.ts';
import type { DispatchFn, MakeLiveSlotsFn, GCTools } from './services/types.ts';
import { makeVatKVStore } from './store/vat-kv-store.ts';
import type {
  VatConfig,
  VatDeliveryResult,
  VatId,
  VatSyscallObject,
} from './types.ts';
import { isVatConfig, coerceVatSyscallObject } from './types.ts';

const makeLiveSlots: MakeLiveSlotsFn = localMakeLiveSlots;

// eslint-disable-next-line n/no-unsupported-features/node-builtins
export type FetchBlob = (bundleURL: string) => Promise<Response>;

type SupervisorRpcClient = Pick<
  RpcClient<typeof vatSyscallMethodSpecs>,
  'notify' | 'handleResponse'
>;

type SupervisorConstructorProps = {
  id: VatId;
  kernelStream: DuplexStream<JsonRpcMessage, JsonRpcMessage>;
  logger: Logger;
  vatPowers?: Record<string, unknown> | undefined;
  fetchBlob?: FetchBlob;
};

const marshal = makeMarshal(undefined, undefined, {
  serializeBodyFormat: 'smallcaps',
});

export class VatSupervisor {
  /** The id of the vat being supervised */
  readonly id: VatId;

  /** Communications channel between this vat and the kernel */
  readonly #kernelStream: DuplexStream<JsonRpcMessage, JsonRpcMessage>;

  /** The logger for this vat */
  readonly #logger: Logger;

  /** RPC client for sending syscall requests to the kernel */
  readonly #rpcClient: SupervisorRpcClient;

  /** RPC service for handling requests from the kernel */
  readonly #rpcService: RpcService<typeof vatHandlers>;

  /** Flag that the user code has been loaded */
  #loaded: boolean = false;

  /** Function to dispatch deliveries into liveslots */
  #dispatch: DispatchFn | null;

  /** In-memory KVStore cache for this vat. */
  #vatKVStore: VatKVStore | undefined;

  /** External capabilities for this vat. */
  readonly #vatPowers: Record<string, unknown>;

  /** Capability to fetch the bundle of code to run in this vat. */
  readonly #fetchBlob: FetchBlob;

  /**
   * Construct a new VatSupervisor instance.
   *
   * @param params - Named constructor parameters.
   * @param params.id - The id of the vat being supervised.
   * @param params.kernelStream - Communications channel connected to the kernel.
   * @param params.logger - The logger for this vat.
   * @param params.vatPowers - The external capabilities for this vat.
   * @param params.fetchBlob - Function to fetch the user code bundle for this vat.
   */
  constructor({
    id,
    kernelStream,
    logger,
    vatPowers,
    fetchBlob,
  }: SupervisorConstructorProps) {
    this.id = id;
    this.#kernelStream = kernelStream;
    this.#logger = logger;
    this.#vatPowers = vatPowers ?? {};
    this.#dispatch = null;
    const defaultFetchBlob: FetchBlob = async (bundleURL: string) =>
      await fetch(bundleURL);
    this.#fetchBlob = fetchBlob ?? defaultFetchBlob;

    this.#rpcClient = new RpcClient(
      vatSyscallMethodSpecs,
      async (request) => {
        await this.#kernelStream.write(request);
      },
      `${this.id}:`,
      this.#logger.subLogger({ tags: ['rpc-client'] }),
    );

    this.#rpcService = new RpcService(vatHandlers, {
      initVat: this.#initVat.bind(this),
      handleDelivery: this.#deliver.bind(this),
    });

    Promise.all([
      this.#kernelStream.drain(this.#handleMessage.bind(this)),
    ]).catch(async (error) => {
      this.#logger.error(
        `Unexpected read error from VatSupervisor "${this.id}"`,
        error,
      );
      await this.terminate(new StreamReadError({ vatId: this.id }, error));
    });
  }

  /**
   * Terminate the VatSupervisor.
   *
   * @param error - The error to terminate the VatSupervisor with.
   */
  async terminate(error?: Error): Promise<void> {
    await this.#kernelStream.end(error);
  }

  /**
   * Handle a message from the kernel.
   *
   * @param message - The vat message to handle.
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
        await this.#kernelStream.write({
          id: message.id,
          result,
          jsonrpc: '2.0',
        });
      } catch (error) {
        await this.#kernelStream.write({
          id: message.id,
          error: serializeError(error),
          jsonrpc: '2.0',
        });
      }
    }
  }

  /**
   * Execute a syscall by sending it to the kernel. To support the synchronous
   * requirements of the liveslots interface, it optimistically assumes success;
   * errors will be dealt with at the end of the crank.
   *
   * @param vso - Descriptor of the syscall to be issued.
   *
   * @returns a syscall success result.
   */
  executeSyscall(vso: VatSyscallObject): VatSyscallResult {
    // IMPORTANT: Syscall architecture design explanation:
    // - Vats operate on an "optimistic execution" model - they send syscalls and continue execution
    //    without waiting for responses, assuming success.
    // - The Kernel processes syscalls synchronously on receipt and failures are caught in VatHandle.
    // - The vat is terminated and the crank is rolled back if a syscall fails.
    this.#rpcClient
      .notify('syscall', coerceVatSyscallObject(vso))
      // Just to please the linter (notifications never reject)
      .catch(() => undefined);
    return ['ok', null];
  }

  async #deliver(params: VatDeliveryObject): Promise<VatDeliveryResult> {
    if (!this.#dispatch) {
      throw new Error(`cannot deliver before vat is loaded`);
    }

    let deliveryError: string | null = null;

    try {
      await this.#dispatch(harden(params));
    } catch (error) {
      // Handle delivery errors
      deliveryError = error instanceof Error ? error.message : String(error);
      this.#logger.error(`Delivery error in vat ${this.id}:`, deliveryError);
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return [this.#vatKVStore!.checkpoint(), deliveryError];
  }

  /**
   * Initialize the vat by loading its user code bundle and creating a liveslots
   * instance to manage it.
   *
   * @param vatConfig - Configuration object describing the vat to be intialized.
   * @param state - A Map representing the current persistent state of the vat.
   *
   * @returns a promise for a checkpoint of the new vat.
   */
  async #initVat(
    vatConfig: VatConfig,
    state: Map<string, string>,
  ): Promise<VatDeliveryResult> {
    if (this.#loaded) {
      throw Error(
        'VatSupervisor received initVat after user code already loaded',
      );
    }
    if (!isVatConfig(vatConfig)) {
      throw Error('VatSupervisor received initVat with bad config parameter');
    }
    // XXX TODO: this check can and should go away once we can handle `bundleName` and `sourceSpec` too
    if (!('bundleSpec' in vatConfig)) {
      throw Error(
        'for now, only sourceSpec is support in vatConfig specifications',
      );
    }
    this.#loaded = true;

    this.#vatKVStore = makeVatKVStore(state);
    const syscall = makeSupervisorSyscall(this, this.#vatKVStore);
    const liveSlotsOptions = {}; // XXX should be something more real

    const gcTools: GCTools = harden({
      WeakRef,
      FinalizationRegistry,
      waitUntilQuiescent,
      gcAndFinalize: makeGCAndFinalize(),
      meterControl: makeDummyMeterControl(),
    });

    const workerEndowments = {
      console: this.#logger.subLogger({ tags: ['console'] }),
      assert: globalThis.assert,
      ...makeEndowments(syscall, gcTools, this.id),
    };

    const { bundleSpec, parameters } = vatConfig;

    const fetched = await this.#fetchBlob(bundleSpec);
    if (!fetched.ok) {
      throw Error(`fetch of user code ${bundleSpec} failed: ${fetched.status}`);
    }
    const bundle = await fetched.json();
    const buildVatNamespace = async (
      lsEndowments: object,
      inescapableGlobalProperties: object,
    ): Promise<Record<string, unknown>> => {
      const vatNS = await importBundle(bundle, {
        filePrefix: `vat-${this.id}/...`,
        endowments: { ...workerEndowments, ...lsEndowments },
        inescapableGlobalProperties,
      });
      return vatNS;
    };

    const liveslots = makeLiveSlots(
      syscall,
      this.id,
      this.#vatPowers,
      liveSlotsOptions,
      gcTools,
      this.#logger.subLogger({ tags: ['liveslots'] }),
      buildVatNamespace,
    );

    this.#dispatch = liveslots.dispatch;
    const serParam = marshal.toCapData(harden(parameters)) as CapData<string>;

    return await this.#deliver(harden(['startVat', serParam]));
  }
}
