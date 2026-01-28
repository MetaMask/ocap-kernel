import type {
  SwingSetCapData,
  VatOneResolution,
  VatSyscallObject,
  VatSyscallResult,
} from '@agoric/swingset-liveslots';
import { Logger } from '@metamask/logger';

import {
  performDropImports,
  performRetireImports,
  performExportCleanup,
} from '../garbage-collection/gc-handlers.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import { makeError } from '../liveslots/kernel-marshal.ts';
import type { KernelStore } from '../store/index.ts';
import { coerceMessage } from '../types.ts';
import type { Message, SystemVatId, KRef } from '../types.ts';

type SystemVatSyscallProps = {
  systemVatId: SystemVatId;
  kernelQueue: KernelQueue;
  kernelStore: KernelStore;
  isActive: () => boolean;
  logger?: Logger | undefined;
};

/**
 * Handles syscalls from a system vat.
 *
 * Similar to VatSyscall but for system vats. System vats run without
 * compartment isolation directly in the host process and don't participate
 * in kernel persistence machinery.
 */
export class SystemVatSyscall {
  /** The ID of the system vat */
  readonly systemVatId: SystemVatId;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** The kernel's store */
  readonly #kernelStore: KernelStore;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger | undefined;

  /** Function to check if the system vat is still active */
  readonly #isActive: () => boolean;

  /** The illegal syscall that was received */
  illegalSyscall: { vatId: SystemVatId; info: SwingSetCapData } | undefined;

  /** The error when delivery failed */
  deliveryError: string | undefined;

  /** The termination request that was received from the vat with syscall.exit() */
  vatRequestedTermination:
    | { reject: boolean; info: SwingSetCapData }
    | undefined;

  /**
   * Construct a new SystemVatSyscall instance.
   *
   * @param props - The properties for the SystemVatSyscall.
   * @param props.systemVatId - The ID of the system vat.
   * @param props.kernelQueue - The kernel's run queue.
   * @param props.kernelStore - The kernel's store.
   * @param props.isActive - Function to check if the system vat is still active.
   * @param props.logger - The logger for the SystemVatSyscall.
   */
  constructor({
    systemVatId,
    kernelQueue,
    kernelStore,
    isActive,
    logger,
  }: SystemVatSyscallProps) {
    this.systemVatId = systemVatId;
    this.#kernelQueue = kernelQueue;
    this.#kernelStore = kernelStore;
    this.#isActive = isActive;
    this.#logger = logger;
  }

  /**
   * Handle a 'send' syscall from the system vat.
   *
   * @param target - The target of the message send.
   * @param message - The message that was sent.
   */
  #handleSyscallSend(target: KRef, message: Message): void {
    this.#kernelQueue.enqueueSend(target, message);
  }

  /**
   * Handle a 'resolve' syscall from the system vat.
   *
   * @param resolutions - One or more promise resolutions.
   */
  #handleSyscallResolve(resolutions: VatOneResolution[]): void {
    this.#kernelQueue.resolvePromises(this.systemVatId, resolutions);
  }

  /**
   * Handle a 'subscribe' syscall from the system vat.
   *
   * @param kpid - The KRef of the promise being subscribed to.
   */
  #handleSyscallSubscribe(kpid: KRef): void {
    const kp = this.#kernelStore.getKernelPromise(kpid);
    if (kp.state === 'unresolved') {
      this.#kernelStore.addPromiseSubscriber(this.systemVatId, kpid);
    } else {
      this.#kernelQueue.enqueueNotify(this.systemVatId, kpid);
    }
  }

  /**
   * Handle a 'dropImports' syscall from the system vat.
   *
   * @param krefs - The KRefs of the imports to be dropped.
   */
  #handleSyscallDropImports(krefs: KRef[]): void {
    performDropImports(krefs, this.systemVatId, this.#kernelStore);
  }

  /**
   * Handle a 'retireImports' syscall from the system vat.
   *
   * @param krefs - The KRefs of the imports to be retired.
   */
  #handleSyscallRetireImports(krefs: KRef[]): void {
    performRetireImports(krefs, this.systemVatId, this.#kernelStore);
  }

  /**
   * Handle retiring or abandoning exports syscall from the system vat.
   *
   * @param krefs - The KRefs of the exports to be retired/abandoned.
   * @param checkReachable - If true, verify the object is not reachable
   *   (retire). If false, ignore reachability (abandon).
   */
  #handleSyscallExportCleanup(krefs: KRef[], checkReachable: boolean): void {
    performExportCleanup(
      krefs,
      checkReachable,
      this.systemVatId,
      this.#kernelStore,
    );

    const action = checkReachable ? 'retire' : 'abandon';
    for (const kref of krefs) {
      this.#logger?.debug(`${action}Exports: deleted object ${kref}`);
    }
  }

  /**
   * Handle a syscall from the system vat.
   *
   * @param vso - The syscall that was received.
   * @returns The result of the syscall.
   */
  handleSyscall(vso: VatSyscallObject): VatSyscallResult {
    try {
      this.illegalSyscall = undefined;
      this.vatRequestedTermination = undefined;

      // Check if the system vat is still active
      if (!this.#isActive()) {
        this.#recordVatFatalSyscall('system vat not found');
        return harden(['error', 'system vat not found']);
      }

      const kso: VatSyscallObject = this.#kernelStore.translateSyscallVtoK(
        this.systemVatId,
        vso,
      );
      const [op] = kso;
      const { systemVatId } = this;
      switch (op) {
        case 'send': {
          const [, target, message] = kso;
          this.#logger?.log(
            `@@@@ ${systemVatId} syscall send ${target}<-${JSON.stringify(message)}`,
          );
          this.#handleSyscallSend(target, coerceMessage(message));
          break;
        }
        case 'subscribe': {
          const [, promise] = kso;
          this.#logger?.log(`@@@@ ${systemVatId} syscall subscribe ${promise}`);
          this.#handleSyscallSubscribe(promise);
          break;
        }
        case 'resolve': {
          const [, resolutions] = kso;
          this.#logger?.log(
            `@@@@ ${systemVatId} syscall resolve ${JSON.stringify(resolutions)}`,
          );
          this.#handleSyscallResolve(resolutions as VatOneResolution[]);
          break;
        }
        case 'exit': {
          const [, isFailure, info] = kso;
          this.#logger?.log(
            `@@@@ ${systemVatId} syscall exit fail=${isFailure} ${JSON.stringify(info)}`,
          );
          this.vatRequestedTermination = { reject: isFailure, info };
          break;
        }
        case 'dropImports': {
          const [, refs] = kso;
          this.#logger?.log(
            `@@@@ ${systemVatId} syscall dropImports ${JSON.stringify(refs)}`,
          );
          this.#handleSyscallDropImports(refs);
          break;
        }
        case 'retireImports': {
          const [, refs] = kso;
          this.#logger?.log(
            `@@@@ ${systemVatId} syscall retireImports ${JSON.stringify(refs)}`,
          );
          this.#handleSyscallRetireImports(refs);
          break;
        }
        case 'retireExports': {
          const [, refs] = kso;
          this.#logger?.log(
            `@@@@ ${systemVatId} syscall retireExports ${JSON.stringify(refs)}`,
          );
          this.#handleSyscallExportCleanup(refs, true);
          break;
        }
        case 'abandonExports': {
          const [, refs] = kso;
          this.#logger?.log(
            `@@@@ ${systemVatId} syscall abandonExports ${JSON.stringify(refs)}`,
          );
          this.#handleSyscallExportCleanup(refs, false);
          break;
        }
        case 'callNow':
        case 'vatstoreGet':
        case 'vatstoreGetNextKey':
        case 'vatstoreSet':
        case 'vatstoreDelete': {
          // System vats don't support vatstore operations (they're non-durable)
          this.#logger?.warn(
            `system vat ${systemVatId} issued unsupported syscall ${op}`,
            vso,
          );
          break;
        }
        default:
          // Compile-time exhaustiveness check
          this.#logger?.warn(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `system vat ${systemVatId} issued unknown syscall ${op}`,
            vso,
          );
          break;
      }
      return harden(['ok', null]);
    } catch (error) {
      this.#logger?.error(
        `Fatal syscall error in system vat ${this.systemVatId}`,
        error,
      );
      this.#recordVatFatalSyscall('syscall translation error: prepare to die');
      return harden([
        'error',
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }

  /**
   * Log a fatal syscall error and set the illegalSyscall property.
   *
   * @param error - The error message to log.
   */
  #recordVatFatalSyscall(error: string): void {
    this.illegalSyscall = { vatId: this.systemVatId, info: makeError(error) };
  }
}
