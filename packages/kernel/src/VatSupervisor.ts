import { makeLiveSlots as localMakeLiveSlots } from '@agoric/swingset-liveslots';
// XXX Reenable the following once the packaging of liveslots is fixed (and at
// the same time remove the below import of ./ag-types-index.js)
// import type { VatSyscallObject, VatSyscallResult, VatDeliveryObject } from '@agoric/swingset-liveslots';
import { importBundle } from '@endo/import-bundle';
import { makeMarshal } from '@endo/marshal';
import type { CapData } from '@endo/marshal';
import { StreamReadError } from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import { stringify } from '@ocap/utils';

import type {
  VatSyscallObject,
  VatSyscallResult,
  VatDeliveryObject,
} from './ag-types-index.js';
import { makeDummyMeterControl } from './dummyMeterControl.js';
import type { VatCommand, VatCommandReply } from './messages/index.js';
import { VatCommandMethod } from './messages/index.js';
import { makeSQLKVStore } from './store/sqlite-kv-store.js';
import { makeSupervisorSyscall } from './syscall.js';
import type { VatConfig } from './types.js';
import { ROOT_OBJECT_VREF, isVatConfig } from './types.js';
import { waitUntilQuiescent } from './waitUntilQuiescent.js';

type DispatchFn = (vdo: VatDeliveryObject) => Promise<void>;
type LiveSlots = {
  dispatch: DispatchFn;
};
const makeLiveSlots: (...args: unknown[]) => LiveSlots = localMakeLiveSlots; // XXX make this better

type SupervisorConstructorProps = {
  id: string;
  commandStream: DuplexStream<VatCommand, VatCommandReply>;
};

const marshal = makeMarshal(undefined, undefined, {
  serializeBodyFormat: 'smallcaps',
});

export class VatSupervisor {
  // XXX As VatSupervisor is currently used, the id is bogus and useless;
  // VatSupervisor gets created in iframe.ts, which will always specify the id
  // to be 'iframe'.  This not helpful.
  readonly id: string;

  readonly #commandStream: DuplexStream<VatCommand, VatCommandReply>;

  readonly #defaultCompartment = new Compartment({ URL });

  #loaded: boolean = false;

  #dispatch: DispatchFn | null;

  readonly #syscallsInFlight: Promise<unknown>[] = [];

  constructor({ id, commandStream }: SupervisorConstructorProps) {
    this.id = id;
    this.#commandStream = commandStream;
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
   * Terminates the VatSupervisor.
   *
   * @param error - The error to terminate the VatSupervisor with.
   */
  async terminate(error?: Error): Promise<void> {
    await this.#commandStream.end(error);
  }

  /**
   * Handle a message from the parent window.
   *
   * @param vatMessage - The vat message to handle.
   * @param vatMessage.id - The id of the message.
   * @param vatMessage.payload - The payload to handle.
   */
  async handleMessage({ id, payload }: VatCommand): Promise<void> {
    switch (payload.method) {
      case VatCommandMethod.evaluate: {
        if (typeof payload.params !== 'string') {
          console.error(
            'VatSupervisor received command with unexpected params',
            // @ts-expect-error Runtime does not respect "never".
            stringify(payload.params),
          );
          return;
        }
        const result = this.evaluate(payload.params);
        await this.replyToMessage(id, {
          method: VatCommandMethod.evaluate,
          params: stringify(result),
        });
        break;
      }

      case VatCommandMethod.deliver: {
        if (!this.#dispatch) {
          console.error(`cannot deliver before vat is loaded`);
          return;
        }
        await this.#dispatch(harden(payload.params));
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
          'VatSupervisor received unexpected command method:',
          // @ts-expect-error Runtime does not respect "never".
          payload.method,
        );
    }
  }

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

  async #initVat(vatConfig: VatConfig): Promise<string> {
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

    const kvStore = await makeSQLKVStore(`[vat-${this.id}]`, true);
    const syscall = makeSupervisorSyscall(this, kvStore);
    const vatPowers = {}; // XXX should be something more real
    const liveSlotsOptions = {}; // XXX should be something more real

    const gcTools = harden({
      WeakRef,
      FinalizationRegistry,
      waitUntilQuiescent,
      gcAndFinalize: null,
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
   * Reply to a message from the parent window.
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

  /**
   * Evaluate a string in the default compartment.
   *
   * @param source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  evaluate(source: string): string {
    try {
      return this.#defaultCompartment.evaluate(source);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      return `Error: ${(error as { message?: string }).message || 'Unknown'}`;
    }
  }
}
