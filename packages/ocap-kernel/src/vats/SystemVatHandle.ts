import type {
  VatDeliveryObject,
  VatSyscallObject,
  VatSyscallResult,
  Message as SwingSetMessage,
} from '@agoric/swingset-liveslots';
import type { Logger } from '@metamask/logger';

import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type { SystemVatId } from '../types.ts';
import { BaseVatHandle } from './BaseVatHandle.ts';
import type { DeliveryObject } from './BaseVatHandle.ts';
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
export class SystemVatHandle extends BaseVatHandle {
  /** The ID of the system vat this handles */
  readonly systemVatId: SystemVatId;

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
    const vatSyscall = new VatSyscall({
      vatId: systemVatId,
      kernelQueue,
      kernelStore,
      isActive: () => this.#isActive,
      vatLabel: 'system vat',
      logger: logger?.subLogger({ tags: ['syscall'] }),
    });

    super(vatSyscall);

    this.systemVatId = systemVatId;

    // Set up deliver function that coerces Message to SwingSetMessage and hardens
    this.deliver = async (delivery: DeliveryObject): Promise<string | null> => {
      let coercedDelivery: VatDeliveryObject;
      if (delivery[0] === 'message') {
        const [, target, message] = delivery;
        const swingSetMessage: SwingSetMessage = {
          methargs: message.methargs,
          result: message.result ?? null,
        };
        coercedDelivery = ['message', target, swingSetMessage];
      } else {
        coercedDelivery = delivery;
      }
      return deliver(harden(coercedDelivery));
    };

    harden(this);
  }

  /**
   * Get a syscall handler function to pass to the system vat supervisor.
   *
   * @returns A function that handles syscalls from the system vat and returns the result.
   */
  getSyscallHandler(): (syscall: VatSyscallObject) => VatSyscallResult {
    return (syscall: VatSyscallObject) => {
      return this.vatSyscall.handleSyscall(syscall);
    };
  }
}
