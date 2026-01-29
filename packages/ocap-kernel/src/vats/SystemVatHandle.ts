import type {
  VatDeliveryObject,
  VatOneResolution,
  VatSyscallObject,
  VatSyscallResult,
  Message as SwingSetMessage,
} from '@agoric/swingset-liveslots';
import type { Logger } from '@metamask/logger';

import type { KernelQueue } from '../KernelQueue.ts';
import { makeError } from '../liveslots/kernel-marshal.ts';
import type { KernelStore } from '../store/index.ts';
import type {
  Message,
  SystemVatId,
  VRef,
  CrankResults,
  EndpointHandle,
} from '../types.ts';
import { VatSyscall } from './VatSyscall.ts';

/**
 * Delivery callback type - called by kernel to deliver messages to the system vat.
 */
export type SystemVatDeliverFn = (
  delivery: VatDeliveryObject,
) => Promise<string | null>;

/**
 * Syscall callback type - called by system vat to send syscalls to kernel.
 */
export type SystemVatSyscallFn = (
  syscall: VatSyscallObject,
) => VatSyscallResult;

type SystemVatHandleProps = {
  systemVatId: SystemVatId;
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  deliver: SystemVatDeliverFn;
  logger?: Logger | undefined;
};

/**
 * Handles communication with and lifecycle management of a system vat.
 *
 * System vats run without compartment isolation directly in the host process.
 * They don't participate in kernel persistence machinery (no vatstore).
 */
export class SystemVatHandle implements EndpointHandle {
  /** The ID of the system vat this handles */
  readonly systemVatId: SystemVatId;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger | undefined;

  /** The system vat's syscall handler */
  readonly #vatSyscall: VatSyscall;

  /** Callback to deliver messages to the system vat */
  readonly #deliver: SystemVatDeliverFn;

  /** Flag indicating if this handle is active */
  readonly #isActive: boolean = true;

  /**
   * Construct a new SystemVatHandle instance.
   *
   * @param props - Named constructor parameters.
   * @param props.systemVatId - The system vat ID.
   * @param props.kernelStore - The kernel's persistent state store.
   * @param props.kernelQueue - The kernel's queue.
   * @param props.deliver - Callback function to deliver messages to the system vat.
   * @param props.logger - Optional logger for error and diagnostic output.
   */
  constructor({
    systemVatId,
    kernelStore,
    kernelQueue,
    deliver,
    logger,
  }: SystemVatHandleProps) {
    this.systemVatId = systemVatId;
    this.#logger = logger;
    this.#deliver = deliver;
    this.#vatSyscall = new VatSyscall({
      vatId: systemVatId,
      kernelQueue,
      kernelStore,
      isActive: () => this.#isActive,
      vatLabel: 'system vat',
      logger: this.#logger?.subLogger({ tags: ['syscall'] }),
    });

    harden(this);
  }

  /**
   * Get a syscall handler function to pass to the system vat supervisor.
   *
   * @returns A function that handles syscalls from the system vat and returns the result.
   */
  getSyscallHandler(): (syscall: VatSyscallObject) => VatSyscallResult {
    return (syscall: VatSyscallObject) => {
      return this.#vatSyscall.handleSyscall(syscall);
    };
  }

  /**
   * Make a 'message' delivery to the system vat.
   *
   * @param target - The VRef of the object to which the message is addressed.
   * @param message - The message to deliver.
   * @returns The crank results.
   */
  async deliverMessage(target: VRef, message: Message): Promise<CrankResults> {
    const swingSetMessage: SwingSetMessage = {
      methargs: message.methargs,
      result: message.result ?? null,
    };
    const deliveryError = await this.#deliver(
      harden(['message', target, swingSetMessage]),
    );
    return this.#getCrankResults(deliveryError);
  }

  /**
   * Make a 'notify' delivery to the system vat.
   *
   * @param resolutions - One or more promise resolutions to deliver.
   * @returns The crank results.
   */
  async deliverNotify(resolutions: VatOneResolution[]): Promise<CrankResults> {
    const deliveryError = await this.#deliver(harden(['notify', resolutions]));
    return this.#getCrankResults(deliveryError);
  }

  /**
   * Make a 'dropExports' delivery to the system vat.
   *
   * @param vrefs - The VRefs of the exports to be dropped.
   * @returns The crank results.
   */
  async deliverDropExports(vrefs: VRef[]): Promise<CrankResults> {
    const deliveryError = await this.#deliver(harden(['dropExports', vrefs]));
    return this.#getCrankResults(deliveryError);
  }

  /**
   * Make a 'retireExports' delivery to the system vat.
   *
   * @param vrefs - The VRefs of the exports to be retired.
   * @returns The crank results.
   */
  async deliverRetireExports(vrefs: VRef[]): Promise<CrankResults> {
    const deliveryError = await this.#deliver(harden(['retireExports', vrefs]));
    return this.#getCrankResults(deliveryError);
  }

  /**
   * Make a 'retireImports' delivery to the system vat.
   *
   * @param vrefs - The VRefs of the imports to be retired.
   * @returns The crank results.
   */
  async deliverRetireImports(vrefs: VRef[]): Promise<CrankResults> {
    const deliveryError = await this.#deliver(harden(['retireImports', vrefs]));
    return this.#getCrankResults(deliveryError);
  }

  /**
   * Make a 'bringOutYourDead' delivery to the system vat.
   *
   * @returns The crank results.
   */
  async deliverBringOutYourDead(): Promise<CrankResults> {
    const deliveryError = await this.#deliver(harden(['bringOutYourDead']));
    return this.#getCrankResults(deliveryError);
  }

  /**
   * Get the crank results after a delivery.
   *
   * @param deliveryError - The error from delivery, if any.
   * @returns The crank results.
   */
  #getCrankResults(deliveryError: string | null): CrankResults {
    const results: CrankResults = {
      didDelivery: this.systemVatId,
    };

    // These conditionals express a priority order: the consequences of an
    // illegal syscall take precedence over a vat requesting termination, etc.
    if (this.#vatSyscall.illegalSyscall) {
      results.abort = true;
      const { info } = this.#vatSyscall.illegalSyscall;
      results.terminate = { vatId: this.systemVatId, reject: true, info };
    } else if (deliveryError) {
      results.abort = true;
      const info = makeError(deliveryError);
      results.terminate = { vatId: this.systemVatId, reject: true, info };
    } else if (this.#vatSyscall.vatRequestedTermination) {
      if (this.#vatSyscall.vatRequestedTermination.reject) {
        results.abort = true;
      }
      results.terminate = {
        vatId: this.systemVatId,
        ...this.#vatSyscall.vatRequestedTermination,
      };
    }

    return harden(results);
  }
}
