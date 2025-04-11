import { makeLiveSlots as localMakeLiveSlots } from '@agoric/swingset-liveslots';
import type {
  VatDeliveryObject,
  VatSyscallObject,
  VatSyscallResult,
} from '@agoric/swingset-liveslots';
import { importBundle } from '@endo/import-bundle';
import { makeMarshal } from '@endo/marshal';
import type { CapData } from '@endo/marshal';
import { StreamReadError } from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import { waitUntilQuiescent } from '@ocap/utils';

import type { VatCommand, VatCommandReply } from './messages/index.ts';
import { VatCommandMethod } from './messages/index.ts';
import { makeGCAndFinalize } from './services/gc-finalize.ts';
import { makeDummyMeterControl } from './services/meter-control.ts';
import { makeSupervisorSyscall } from './services/syscall.ts';
import type { DispatchFn, MakeLiveSlotsFn, GCTools } from './services/types.ts';
import type { VatKVStore } from './store/vat-kv-store.ts';
import { makeVatKVStore } from './store/vat-kv-store.ts';
import type { VatConfig, VatId, VRef } from './types.ts';
import { ROOT_OBJECT_VREF, isVatConfig } from './types.ts';

const makeLiveSlots: MakeLiveSlotsFn = localMakeLiveSlots;

// eslint-disable-next-line n/no-unsupported-features/node-builtins
export type FetchBlob = (bundleURL: string) => Promise<Response>;

type SupervisorConstructorProps = {
  id: VatId;
  commandStream: DuplexStream<VatCommand, VatCommandReply>;
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
  readonly #commandStream: DuplexStream<VatCommand, VatCommandReply>;

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

  /** Result promises from all syscalls sent to the kernel in the current crank */
  readonly #syscallsInFlight: Promise<unknown>[] = [];

  /**
   * Construct a new VatSupervisor instance.
   *
   * @param params - Named constructor parameters.
   * @param params.id - The id of the vat being supervised.
   * @param params.commandStream - Communications channel connected to the kernel.
   * @param params.vatPowers - The external capabilities for this vat.
   * @param params.fetchBlob - Function to fetch the user code bundle for this vat.
   */
  constructor({
    id,
    commandStream,
    vatPowers,
    fetchBlob,
  }: SupervisorConstructorProps) {
    this.id = id;
    this.#commandStream = commandStream;
    this.#vatPowers = vatPowers ?? {};
    this.#dispatch = null;
    const defaultFetchBlob: FetchBlob = async (bundleURL: string) =>
      await fetch(bundleURL);
    this.#fetchBlob = fetchBlob ?? defaultFetchBlob;

    Promise.all([
      this.#commandStream.drain(this.handleMessage.bind(this)),
    ]).catch(async (error) => {
      console.error(
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
    await this.#commandStream.end(error);
  }

  /**
   * Handle a message from the kernel.
   *
   * @param message - The vat message to handle.
   * @param message.id - The id of the message.
   * @param message.payload - The payload to handle.
   */
  async handleMessage({ id, payload }: VatCommand): Promise<void> {
    switch (payload.method) {
      case VatCommandMethod.deliver: {
        if (!this.#dispatch) {
          console.error(`cannot deliver before vat is loaded`);
          return;
        }
        await this.#dispatch(harden(payload.params) as VatDeliveryObject);
        await Promise.all(this.#syscallsInFlight);
        this.#syscallsInFlight.length = 0;
        await this.replyToMessage(id, {
          method: VatCommandMethod.deliver,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          params: this.#vatKVStore!.checkpoint(),
        });
        break;
      }

      case VatCommandMethod.initVat: {
        await this.#initVat(
          payload.params.vatConfig,
          new Map(Object.entries(payload.params.state)),
        );
        await this.replyToMessage(id, {
          method: VatCommandMethod.initVat,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          params: this.#vatKVStore!.checkpoint(),
        });
        break;
      }

      case VatCommandMethod.ping:
        await this.replyToMessage(id, {
          method: VatCommandMethod.ping,
          params: 'pong',
        });
        break;

      case VatCommandMethod.syscall: {
        const [result, failure] = payload.params;
        if (result !== 'ok') {
          // A syscall can't fail as the result of user code misbehavior, but
          // only from some kind of internal system problem, so if it happens we
          // die.
          const errMsg = `syscall failure ${failure}`;
          console.error(errMsg);
          await this.terminate(Error(errMsg));
        }
        break;
      }

      default:
        throw Error(
          // @ts-expect-error Compile-time exhaustiveness check
          `VatSupervisor received unexpected command method: "${payload.method}"`,
        );
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
    const payload: VatCommandReply['payload'] = {
      method: VatCommandMethod.syscall,
      params: vso,
    };
    this.#syscallsInFlight.push(
      this.#commandStream.write({
        id: 'none',
        payload,
      }),
    );
    return ['ok', null];
  }

  /**
   * Initialize the vat by loading its user code bundle and creating a liveslots
   * instance to manage it.
   *
   * @param vatConfig - Configuration object describing the vat to be intialized.
   * @param state - A Map representing the current persistent state of the vat.
   *
   * @returns a promise for the VRef of the new vat's root object.
   */
  async #initVat(
    vatConfig: VatConfig,
    state: Map<string, string>,
  ): Promise<VRef> {
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
      console,
      assert: globalThis.assert,
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
      console,
      buildVatNamespace,
    );

    this.#dispatch = liveslots.dispatch;
    const serParam = marshal.toCapData(harden(parameters)) as CapData<string>;
    await this.#dispatch(harden(['startVat', serParam]));

    return ROOT_OBJECT_VREF;
  }

  /**
   * Reply to a message from the kernel.
   *
   * @param id - The id of the message to reply to.
   * @param payload - The payload to reply with.
   */
  async replyToMessage(
    id: VatCommandReply['id'],
    payload: VatCommandReply['payload'],
  ): Promise<void> {
    await this.#commandStream.write({ id, payload });
  }
}
