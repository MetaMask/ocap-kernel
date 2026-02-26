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
import type { Message, VatId, KRef } from '../types.ts';

type VatSyscallProps = {
  vatId: VatId;
  kernelQueue: KernelQueue;
  kernelStore: KernelStore;
  logger?: Logger | undefined;
};

/**
 * A VatSyscall is a class that handles syscalls from a vat.
 *
 * This class is responsible for handling syscalls from a vat, including
 * sending messages, resolving promises, and dropping imports.
 */
export class VatSyscall {
  /** The ID of the vat */
  readonly vatId: VatId;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** The kernel's store */
  readonly #kernelStore: KernelStore;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger | undefined;

  /** The illegal syscall that was received */
  illegalSyscall: { vatId: VatId; info: SwingSetCapData } | undefined;

  /** The error when delivery failed */
  deliveryError: string | undefined;

  /** The termination request that was received from the vat with syscall.exit() */
  vatRequestedTermination:
    | { reject: boolean; info: SwingSetCapData }
    | undefined;

  /**
   * Construct a new VatSyscall instance.
   *
   * @param props - The properties for the VatSyscall.
   * @param props.vatId - The ID of the vat.
   * @param props.kernelQueue - The kernel's run queue.
   * @param props.kernelStore - The kernel's store.
   * @param props.logger - The logger for the VatSyscall.
   */
  constructor({ vatId, kernelQueue, kernelStore, logger }: VatSyscallProps) {
    this.vatId = vatId;
    this.#kernelQueue = kernelQueue;
    this.#kernelStore = kernelStore;
    this.#logger = logger;
  }

  /**
   * Handle a 'send' syscall from the vat. During a crank, the send is
   * buffered and flushed on crank completion. Outside a crank (async vat
   * operations like fetch), the send is enqueued immediately to wake the
   * run queue.
   *
   * @param target - The target of the message send.
   * @param message - The message that was sent.
   */
  #handleSyscallSend(target: KRef, message: Message): void {
    const immediate = !this.#kernelStore.isInCrank();
    this.#kernelQueue.enqueueSend(target, message, immediate);
  }

  /**
   * Handle a 'resolve' syscall from the vat. During a crank, notifications
   * are buffered and flushed on crank completion. Outside a crank (async vat
   * operations like fetch), notifications are enqueued immediately to wake
   * the run queue.
   *
   * @param resolutions - One or more promise resolutions.
   */
  #handleSyscallResolve(resolutions: VatOneResolution[]): void {
    const immediate = !this.#kernelStore.isInCrank();
    this.#kernelQueue.resolvePromises(this.vatId, resolutions, immediate);
  }

  /**
   * Handle a 'subscribe' syscall from the vat.
   *
   * @param kpid - The KRef of the promise being subscribed to.
   */
  #handleSyscallSubscribe(kpid: KRef): void {
    const kp = this.#kernelStore.getKernelPromise(kpid);
    if (kp.state === 'unresolved') {
      this.#kernelStore.addPromiseSubscriber(this.vatId, kpid);
    } else {
      const immediate = !this.#kernelStore.isInCrank();
      this.#kernelQueue.enqueueNotify(this.vatId, kpid, immediate);
    }
  }

  /**
   * Handle a 'dropImports' syscall from the vat.
   *
   * @param krefs - The KRefs of the imports to be dropped.
   */
  #handleSyscallDropImports(krefs: KRef[]): void {
    performDropImports(krefs, this.vatId, this.#kernelStore);
  }

  /**
   * Handle a 'retireImports' syscall from the vat.
   *
   * @param krefs - The KRefs of the imports to be retired.
   */
  #handleSyscallRetireImports(krefs: KRef[]): void {
    performRetireImports(krefs, this.vatId, this.#kernelStore);
  }

  /**
   * Handle retiring or abandoning exports syscall from the vat.
   *
   * @param krefs - The KRefs of the exports to be retired/abandoned.
   * @param checkReachable - If true, verify the object is not reachable
   *   (retire). If false, ignore reachability (abandon).
   */
  #handleSyscallExportCleanup(krefs: KRef[], checkReachable: boolean): void {
    performExportCleanup(krefs, checkReachable, this.vatId, this.#kernelStore);

    // XXX This log output is only here for the benefit of a couple of the
    // tests.  Arguably, those tests should be revised not to need it, but for now...
    const action = checkReachable ? 'retire' : 'abandon';
    for (const kref of krefs) {
      this.#logger?.debug(`${action}Exports: deleted object ${kref}`);
    }
  }

  /**
   * Handle a syscall from the vat.
   *
   * @param vso - The syscall that was received.
   * @returns The result of the syscall.
   */
  handleSyscall(vso: VatSyscallObject): VatSyscallResult {
    try {
      this.illegalSyscall = undefined;
      this.vatRequestedTermination = undefined;

      // This is a safety check - this case should never happen
      if (!this.#kernelStore.isVatActive(this.vatId)) {
        this.#recordVatFatalSyscall('vat not found');
        return harden(['error', 'vat not found']);
      }

      const kso: VatSyscallObject = this.#kernelStore.translateSyscallVtoK(
        this.vatId,
        vso,
      );
      const [op] = kso;
      const { vatId } = this;
      switch (op) {
        case 'send': {
          // [KRef, Message];
          const [, target, message] = kso;
          this.#logger?.log(
            `@@@@ ${vatId} syscall send ${target}<-${JSON.stringify(message)}`,
          );
          this.#handleSyscallSend(target, coerceMessage(message));
          break;
        }
        case 'subscribe': {
          // [KRef];
          const [, promise] = kso;
          this.#logger?.log(`@@@@ ${vatId} syscall subscribe ${promise}`);
          this.#handleSyscallSubscribe(promise);
          break;
        }
        case 'resolve': {
          // [VatOneResolution[]];
          const [, resolutions] = kso;
          this.#logger?.log(
            `@@@@ ${vatId} syscall resolve ${JSON.stringify(resolutions)}`,
          );
          this.#handleSyscallResolve(resolutions as VatOneResolution[]);
          break;
        }
        case 'exit': {
          // [boolean, SwingSetCapData];
          const [, isFailure, info] = kso;
          this.#logger?.log(
            `@@@@ ${vatId} syscall exit fail=${isFailure} ${JSON.stringify(info)}`,
          );
          this.vatRequestedTermination = { reject: isFailure, info };
          break;
        }
        case 'dropImports': {
          // [KRef[]];
          const [, refs] = kso;
          this.#logger?.log(
            `@@@@ ${vatId} syscall dropImports ${JSON.stringify(refs)}`,
          );
          this.#handleSyscallDropImports(refs);
          break;
        }
        case 'retireImports': {
          // [KRef[]];
          const [, refs] = kso;
          this.#logger?.log(
            `@@@@ ${vatId} syscall retireImports ${JSON.stringify(refs)}`,
          );
          this.#handleSyscallRetireImports(refs);
          break;
        }
        case 'retireExports': {
          // [KRef[]];
          const [, refs] = kso;
          this.#logger?.log(
            `@@@@ ${vatId} syscall retireExports ${JSON.stringify(refs)}`,
          );
          this.#handleSyscallExportCleanup(refs, true);
          break;
        }
        case 'abandonExports': {
          // [KRef[]];
          const [, refs] = kso;
          this.#logger?.log(
            `@@@@ ${vatId} syscall abandonExports ${JSON.stringify(refs)}`,
          );
          this.#handleSyscallExportCleanup(refs, false);
          break;
        }
        case 'callNow':
        case 'vatstoreGet':
        case 'vatstoreGetNextKey':
        case 'vatstoreSet':
        case 'vatstoreDelete': {
          this.#logger?.warn(`vat ${vatId} issued invalid syscall ${op} `, vso);
          break;
        }
        default:
          // Compile-time exhaustiveness check
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          this.#logger?.warn(`vat ${vatId} issued unknown syscall ${op} `, vso);
          break;
      }
      return harden(['ok', null]);
    } catch (error) {
      this.#logger?.error(`Fatal syscall error in vat ${this.vatId}`, error);
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
    this.illegalSyscall = { vatId: this.vatId, info: makeError(error) };
  }
}
