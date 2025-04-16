import type {
  Message,
  VatOneResolution,
  VatSyscallObject,
} from '@agoric/swingset-liveslots';
import { Logger } from '@ocap/utils';

import type { KernelQueue } from './KernelQueue.ts';
import type { KernelStore } from './store/index.ts';
import { parseRef } from './store/utils/parse-ref.ts';
import type { VatId, KRef, RunQueueItemSend } from './types.ts';

type VatSyscallProps = {
  vatId: VatId;
  kernelQueue: KernelQueue;
  kernelStore: KernelStore;
};

export class VatSyscall {
  /** The ID of the vat */
  readonly vatId: VatId;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** The kernel's store */
  readonly #kernelStore: KernelStore;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger;

  /**
   * Construct a new VatSyscall instance.
   *
   * @param props - The properties for the VatSyscall.
   * @param props.vatId - The ID of the vat.
   * @param props.kernelQueue - The kernel's run queue.
   * @param props.kernelStore - The kernel's store.
   */
  constructor({ vatId, kernelQueue, kernelStore }: VatSyscallProps) {
    this.vatId = vatId;
    this.#kernelQueue = kernelQueue;
    this.#kernelStore = kernelStore;
    this.#logger = new Logger(`[vat ${vatId}]`);
  }

  /**
   * Handle a 'send' syscall from the vat.
   *
   * @param target - The target of the message send.
   * @param message - The message that was sent.
   */
  #handleSyscallSend(target: KRef, message: Message): void {
    const messageItem: RunQueueItemSend = {
      type: 'send',
      target,
      message,
    };
    this.#kernelQueue.enqueueRun(messageItem);
  }

  /**
   * Handle a 'resolve' syscall from the vat.
   *
   * @param resolutions - One or more promise resolutions.
   */
  #handleSyscallResolve(resolutions: VatOneResolution[]): void {
    this.#kernelQueue.resolvePromises(this.vatId, resolutions);
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
      this.#kernelQueue.enqueueNotify(this.vatId, kpid);
    }
  }

  /**
   * Handle a 'dropImports' syscall from the vat.
   *
   * @param krefs - The KRefs of the imports to be dropped.
   */
  #handleSyscallDropImports(krefs: KRef[]): void {
    for (const kref of krefs) {
      const { direction, isPromise } = parseRef(kref);
      // We validate it's an import - meaning this vat received this object from somewhere else
      if (direction === 'export' || isPromise) {
        throw Error(
          `vat ${this.vatId} issued invalid syscall dropImports for ${kref}`,
        );
      }
      this.#kernelStore.clearReachableFlag(this.vatId, kref);
    }
  }

  /**
   * Handle a 'retireImports' syscall from the vat.
   *
   * @param krefs - The KRefs of the imports to be retired.
   */
  #handleSyscallRetireImports(krefs: KRef[]): void {
    for (const kref of krefs) {
      const { direction, isPromise } = parseRef(kref);
      // We validate it's an import - meaning this vat received this object from somewhere else
      if (direction === 'export' || isPromise) {
        throw Error(
          `vat ${this.vatId} issued invalid syscall retireImports for ${kref}`,
        );
      }
      if (this.#kernelStore.getReachableFlag(this.vatId, kref)) {
        throw Error(`syscall.retireImports but ${kref} is still reachable`);
      }
      // deleting the clist entry will decrement the recognizable count, but
      // not the reachable count (because it was unreachable, as we asserted)
      this.#kernelStore.forgetKref(this.vatId, kref);
    }
  }

  /**
   * Handle retiring or abandoning exports syscall from the vat.
   *
   * @param krefs - The KRefs of the exports to be retired/abandoned.
   * @param checkReachable - If true, verify the object is not reachable (retire). If false, ignore reachability (abandon).
   */
  #handleSyscallExportCleanup(krefs: KRef[], checkReachable: boolean): void {
    const action = checkReachable ? 'retire' : 'abandon';
    for (const kref of krefs) {
      const { direction, isPromise } = parseRef(kref);
      // We validate it's an export - meaning this vat created/owns this object
      if (direction === 'import' || isPromise) {
        throw Error(
          `vat ${this.vatId} issued invalid syscall ${action}Exports for ${kref}`,
        );
      }
      if (checkReachable) {
        if (this.#kernelStore.getReachableFlag(this.vatId, kref)) {
          throw Error(
            `syscall.${action}Exports but ${kref} is still reachable`,
          );
        }
      }
      this.#kernelStore.forgetKref(this.vatId, kref);
      this.#logger.debug(`${action}Exports: deleted object ${kref}`);
    }
  }

  /**
   * Handle a syscall from the vat.
   *
   * @param vso - The syscall that was received.
   */
  async handleSyscall(vso: VatSyscallObject): Promise<void> {
    const kso: VatSyscallObject = this.#kernelStore.translateSyscallVtoK(
      this.vatId,
      vso,
    );
    const [op] = kso;
    const { vatId } = this;
    const { log } = console;
    switch (op) {
      case 'send': {
        // [KRef, Message];
        const [, target, message] = kso;
        log(`@@@@ ${vatId} syscall send ${target}<-${JSON.stringify(message)}`);
        this.#handleSyscallSend(target, message);
        break;
      }
      case 'subscribe': {
        // [KRef];
        const [, promise] = kso;
        log(`@@@@ ${vatId} syscall subscribe ${promise}`);
        this.#handleSyscallSubscribe(promise);
        break;
      }
      case 'resolve': {
        // [VatOneResolution[]];
        const [, resolutions] = kso;
        log(`@@@@ ${vatId} syscall resolve ${JSON.stringify(resolutions)}`);
        this.#handleSyscallResolve(resolutions as VatOneResolution[]);
        break;
      }
      case 'exit': {
        // [boolean, SwingSetCapData];
        const [, fail, info] = kso;
        log(`@@@@ ${vatId} syscall exit fail=${fail} ${JSON.stringify(info)}`);
        break;
      }
      case 'dropImports': {
        // [KRef[]];
        const [, refs] = kso;
        log(`@@@@ ${vatId} syscall dropImports ${JSON.stringify(refs)}`);
        this.#handleSyscallDropImports(refs);
        break;
      }
      case 'retireImports': {
        // [KRef[]];
        const [, refs] = kso;
        log(`@@@@ ${vatId} syscall retireImports ${JSON.stringify(refs)}`);
        this.#handleSyscallRetireImports(refs);
        break;
      }
      case 'retireExports': {
        // [KRef[]];
        const [, refs] = kso;
        log(`@@@@ ${vatId} syscall retireExports ${JSON.stringify(refs)}`);
        this.#handleSyscallExportCleanup(refs, true);
        break;
      }
      case 'abandonExports': {
        // [KRef[]];
        const [, refs] = kso;
        log(`@@@@ ${vatId} syscall abandonExports ${JSON.stringify(refs)}`);
        this.#handleSyscallExportCleanup(refs, false);
        break;
      }
      case 'callNow':
      case 'vatstoreGet':
      case 'vatstoreGetNextKey':
      case 'vatstoreSet':
      case 'vatstoreDelete': {
        console.warn(`vat ${vatId} issued invalid syscall ${op} `, vso);
        break;
      }
      default:
        // Compile-time exhaustiveness check
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        console.warn(`vat ${vatId} issued unknown syscall ${op} `, vso);
        break;
    }
  }
}
