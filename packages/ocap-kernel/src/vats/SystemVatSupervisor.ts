import { makeLiveSlots as localMakeLiveSlots } from '@agoric/swingset-liveslots';
import type {
  VatDeliveryObject,
  VatSyscallObject,
  VatSyscallResult,
} from '@agoric/swingset-liveslots';
import { makeMarshal } from '@endo/marshal';
import type { CapData } from '@endo/marshal';
import type { KVStore } from '@metamask/kernel-store';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import type { Json } from '@metamask/utils';

import { makeGCAndFinalize } from '../garbage-collection/gc-finalize.ts';
import { makeDummyMeterControl } from '../liveslots/meter-control.ts';
import type {
  DispatchFn,
  MakeLiveSlotsFn,
  GCTools,
  Syscall,
  SyscallResult,
} from '../liveslots/types.ts';
import type { SystemVatId, SystemVatBuildRootObject } from '../types.ts';

const makeLiveSlots: MakeLiveSlotsFn = localMakeLiveSlots;

const marshal = makeMarshal(undefined, undefined, {
  serializeBodyFormat: 'smallcaps',
});

/**
 * Syscall executor type - synchronously handles syscalls from the system vat.
 */
export type SystemVatExecuteSyscall = (
  vso: VatSyscallObject,
) => VatSyscallResult;

type SystemVatSupervisorProps = {
  id: SystemVatId;
  buildRootObject: SystemVatBuildRootObject;
  vatPowers: Record<string, unknown>;
  parameters: Record<string, Json> | undefined;
  executeSyscall: SystemVatExecuteSyscall;
  logger: Logger;
};

/**
 * A non-persistent KV store for system vats.
 * System vats don't participate in kernel persistence machinery,
 * so their vatstore is ephemeral (Map-based).
 *
 * @returns An ephemeral KVStore implementation.
 */
function makeEphemeralVatKVStore(): KVStore {
  const data = new Map<string, string>();

  return harden({
    has(key: string): boolean {
      return data.has(key);
    },
    get(key: string): string | undefined {
      return data.get(key);
    },
    getRequired(key: string): string {
      const value = data.get(key);
      if (value === undefined) {
        throw Error(`key "${key}" not found`);
      }
      return value;
    },
    set(key: string, value: string): void {
      data.set(key, value);
    },
    delete(key: string): void {
      data.delete(key);
    },
    getNextKey(previousKey: string): string | undefined {
      const keys = [...data.keys()].sort();
      const index = keys.indexOf(previousKey);
      if (index === -1) {
        // If key not found, find first key greater than previousKey
        return keys.find((k) => k > previousKey);
      }
      return keys[index + 1];
    },
    getKeys(_start: string, _end: string): Iterable<string> {
      throw new Error('getKeys not supported for ephemeral store');
    },
    getPrefixedKeys(_prefix: string): Iterable<string> {
      throw new Error('getPrefixedKeys not supported for ephemeral store');
    },
  });
}

/**
 * Supervises a system vat's execution.
 *
 * System vats run without compartment isolation directly in the host process.
 * They don't load bundles via importBundle; instead, they receive a
 * buildRootObject function directly. They use an ephemeral vatstore since
 * they don't participate in kernel persistence machinery.
 */
export class SystemVatSupervisor {
  /** The ID of the system vat being supervised */
  readonly id: SystemVatId;

  /** The logger for this system vat */
  readonly #logger: Logger;

  /** Function to dispatch deliveries into liveslots */
  #dispatch: DispatchFn | null = null;

  /** Flag indicating if the system vat has been initialized */
  #initialized: boolean = false;

  /**
   * Construct a new SystemVatSupervisor instance.
   *
   * @param props - Named constructor parameters.
   * @param props.id - The ID of the system vat being supervised.
   * @param props.buildRootObject - Function to build the vat's root object.
   * @param props.vatPowers - External capabilities for this system vat.
   * @param props.parameters - Parameters to pass to buildRootObject.
   * @param props.executeSyscall - Function to execute syscalls synchronously.
   * @param props.logger - The logger for this system vat.
   */
  constructor({
    id,
    buildRootObject,
    vatPowers,
    parameters,
    executeSyscall,
    logger,
  }: SystemVatSupervisorProps) {
    this.id = id;
    this.#logger = logger;

    // Initialize the system vat synchronously during construction
    this.#initializeVat(buildRootObject, vatPowers, parameters, executeSyscall);
  }

  /**
   * Initialize the system vat by creating liveslots with the provided buildRootObject.
   *
   * @param buildRootObject - Function to build the vat's root object.
   * @param vatPowers - External capabilities for this system vat.
   * @param parameters - Parameters to pass to buildRootObject.
   * @param executeSyscall - Function to execute syscalls synchronously.
   */
  #initializeVat(
    buildRootObject: SystemVatBuildRootObject,
    vatPowers: Record<string, unknown>,
    parameters: Record<string, Json> | undefined,
    executeSyscall: SystemVatExecuteSyscall,
  ): void {
    if (this.#initialized) {
      throw Error('SystemVatSupervisor already initialized');
    }
    this.#initialized = true;

    const kvStore = makeEphemeralVatKVStore();
    const syscall = this.#makeSyscall(executeSyscall, kvStore);
    const liveSlotsOptions = {};

    const gcTools: GCTools = harden({
      WeakRef,
      FinalizationRegistry,
      waitUntilQuiescent,
      gcAndFinalize: makeGCAndFinalize(
        this.#logger.subLogger({ tags: ['gc'] }),
      ),
      meterControl: makeDummyMeterControl(),
    });

    // For system vats, buildVatNamespace returns the buildRootObject directly
    // without loading a bundle via importBundle
    const buildVatNamespace = async (
      lsEndowments: Record<PropertyKey, unknown>,
      _inescapableGlobalProperties: object,
    ): Promise<Record<string, unknown>> => {
      // Provide liveslots endowments as vatPowers to the buildRootObject
      const combinedVatPowers = {
        ...vatPowers,
        ...lsEndowments,
      };

      // Return a namespace object with buildRootObject that wraps the provided one
      // to inject the combined vatPowers
      return {
        buildRootObject: (innerVatPowers: Record<string, unknown>) => {
          // Merge the inner vatPowers (from liveslots) with our combined powers
          const finalVatPowers = { ...combinedVatPowers, ...innerVatPowers };
          return buildRootObject(finalVatPowers, parameters);
        },
      };
    };

    const liveslots = makeLiveSlots(
      syscall,
      this.id,
      vatPowers,
      liveSlotsOptions,
      gcTools,
      this.#logger.subLogger({ tags: ['liveslots'] }),
      buildVatNamespace,
    );

    this.#dispatch = liveslots.dispatch;
  }

  /**
   * Create a syscall interface for the system vat.
   *
   * @param executeSyscall - Function to execute syscalls to the kernel.
   * @param kv - The ephemeral KV store for this system vat.
   * @returns A syscall object for liveslots.
   */
  #makeSyscall(executeSyscall: SystemVatExecuteSyscall, kv: KVStore): Syscall {
    const doSyscall = (vso: VatSyscallObject): SyscallResult => {
      let syscallResult;
      try {
        syscallResult = executeSyscall(vso);
      } catch (problem) {
        this.#logger.warn(`system vat got error during syscall:`, problem);
        throw problem;
      }
      const [type, ...rest] = syscallResult;
      switch (type) {
        case 'ok': {
          const [data] = rest;
          return data;
        }
        case 'error': {
          const [problem] = rest;
          throw Error(`syscall.${vso[0]} failed: ${problem as string}`);
        }
        default:
          throw Error(`unknown result type ${type as string}`);
      }
    };

    return harden({
      send: (target: string, methargs: CapData<string>, result?: string) =>
        doSyscall(['send', target, { methargs, result }]),
      subscribe: (vpid: string) => doSyscall(['subscribe', vpid]),
      resolve: (resolutions) => doSyscall(['resolve', resolutions]),
      exit: (isFailure: boolean, info: CapData<string>) =>
        doSyscall(['exit', isFailure, info]),
      dropImports: (vrefs: string[]) => doSyscall(['dropImports', vrefs]),
      retireImports: (vrefs: string[]) => doSyscall(['retireImports', vrefs]),
      retireExports: (vrefs: string[]) => doSyscall(['retireExports', vrefs]),
      abandonExports: (vrefs: string[]) => doSyscall(['abandonExports', vrefs]),
      callNow: () => {
        throw Error(`callNow not supported for system vats`);
      },
      // System vats use an ephemeral vatstore (non-persistent)
      vatstoreGet: (key: string) => kv.get(key),
      vatstoreGetNextKey: (priorKey: string) => kv.getNextKey(priorKey),
      vatstoreSet: (key: string, value: string) => kv.set(key, value),
      vatstoreDelete: (key: string) => kv.delete(key),
    });
  }

  /**
   * Start the system vat by dispatching the startVat delivery.
   *
   * @returns A promise that resolves when the vat has started, or null on error.
   */
  async start(): Promise<string | null> {
    if (!this.#dispatch) {
      throw new Error('SystemVatSupervisor not initialized');
    }

    let deliveryError: string | null = null;
    try {
      const serParam = marshal.toCapData(harden(undefined)) as CapData<string>;
      await this.#dispatch(harden(['startVat', serParam]));
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : String(error);
      this.#logger.error(
        `Start error in system vat ${this.id}:`,
        deliveryError,
      );
    }
    return deliveryError;
  }

  /**
   * Deliver a message to the system vat.
   *
   * @param delivery - The delivery object to dispatch.
   * @returns A promise that resolves to the delivery error (null if success).
   */
  async deliver(delivery: VatDeliveryObject): Promise<string | null> {
    if (!this.#dispatch) {
      throw new Error('SystemVatSupervisor not initialized');
    }

    let deliveryError: string | null = null;
    try {
      await this.#dispatch(harden(delivery));
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : String(error);
      this.#logger.error(
        `Delivery error in system vat ${this.id}:`,
        deliveryError,
      );
    }
    return deliveryError;
  }
}
