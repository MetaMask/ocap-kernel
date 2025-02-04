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

import type {
  DispatchFn,
  MakeLiveSlotsFn,
  GCTools,
} from './ag-liveslots-types.js';
import { makeDummyMeterControl } from './dummyMeterControl.js';
import type { VatCommand, VatCommandReply } from './messages/index.js';
import { VatCommandMethod } from './messages/index.js';
import type { MakeKVStore } from './store/kernel-store.js';
import { makeSupervisorSyscall } from './syscall.js';
import type { VatConfig, VatId, VRef } from './types.js';
import { ROOT_OBJECT_VREF, isVatConfig } from './types.js';
import { waitUntilQuiescent } from './waitUntilQuiescent.js';

const makeLiveSlots: MakeLiveSlotsFn = localMakeLiveSlots;

type MakeVatPowers = () => Promise<Record<string, unknown>>;

type SupervisorConstructorProps = {
  id: VatId;
  commandStream: DuplexStream<VatCommand, VatCommandReply>;
  makeKVStore: MakeKVStore;
  makeVatPowers?: MakeVatPowers;
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

  /** Capability to create the store for this vat. */
  readonly #makeKVStore: MakeKVStore;

  /** Capability to provide powers (external objects) for this vat. */
  readonly #makeVatPowers: MakeVatPowers;

  /** Result promises from all syscalls sent to the kernel in the current crank */
  readonly #syscallsInFlight: Promise<unknown>[] = [];

  /**
   * Construct a new VatSupervisor instance.
   *
   * @param params - Named constructor parameters.
   * @param params.id - The id of the vat being supervised.
   * @param params.commandStream - Communications channel connected to the kernel.
   * @param params.makeKVStore - Capability to create the store for this vat.
   * @param params.makeVatPowers - Optional capability to provide powers (external objects) for this vat.
   */
  constructor({
    id,
    commandStream,
    makeKVStore,
    makeVatPowers,
  }: SupervisorConstructorProps) {
    this.id = id;
    this.#commandStream = commandStream;
    this.#makeKVStore = makeKVStore;
    this.#makeVatPowers = makeVatPowers ?? (async () => ({}));
    this.#dispatch = null;

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
          params: null, // XXX eventually this should be the actual result?
        });
        break;
      }

      case VatCommandMethod.initVat: {
        const rootObjectVref = await this.#initVat(payload.params);
        await this.replyToMessage(id, {
          method: VatCommandMethod.initVat,
          params: rootObjectVref,
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
   *
   * @returns a promise for the VRef of the new vat's root object.
   */
  async #initVat(vatConfig: VatConfig): Promise<VRef> {
    if (this.#loaded) {
      throw Error(
        'VatSupervisor received initVat after user code already loaded',
      );
    }
    if (!isVatConfig(vatConfig)) {
      throw Error('VatSupervisor received initVat with bad config parameter');
    }
    // XXX TODO: this check can and should go away once we can handle `bundleName` and `sourceSpec` too
    if (!vatConfig.bundleSpec) {
      throw Error(
        'for now, only bundleSpec is support in vatConfig specifications',
      );
    }
    this.#loaded = true;

    const kvStore = await this.#makeKVStore(`[vat-${this.id}]`, true);
    const syscall = makeSupervisorSyscall(this, kvStore);
    const vatPowers = await this.#makeVatPowers(); // XXX should be something more real
    const liveSlotsOptions = {}; // XXX should be something more real

    const gcTools: GCTools = harden({
      WeakRef,
      FinalizationRegistry,
      waitUntilQuiescent,
      // eslint-disable-next-line no-empty-function
      gcAndFinalize: async () => {},
      meterControl: makeDummyMeterControl(),
    });

    const workerEndowments = {
      console,
      assert: globalThis.assert,
    };

    console.log('VatSupervisor requested user code load:', vatConfig);
    const { bundleSpec, parameters } = vatConfig;

    const fetched = await fetch(bundleSpec);
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
      vatPowers,
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
