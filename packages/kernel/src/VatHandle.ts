import type {
  Message,
  VatSyscallObject,
  VatOneResolution,
} from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { VatDeletedError, StreamReadError } from '@ocap/errors';
import type { VatStore } from '@ocap/store';
import type { DuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger, makeCounter } from '@ocap/utils';

import { kser } from './kernel-marshal.ts';
import type { Kernel } from './Kernel.ts';
import { VatCommandMethod } from './messages/index.ts';
import type {
  VatCommandReply,
  VatCommand,
  VatCommandReturnType,
} from './messages/index.ts';
import type { KernelStore } from './store/kernel-store.ts';
import { parseRef } from './store/utils/parse-ref.ts';
import type {
  PromiseCallbacks,
  VatId,
  VatConfig,
  VRef,
  KRef,
  RunQueueItemSend,
} from './types.ts';

type VatConstructorProps = {
  kernel: Kernel;
  vatId: VatId;
  vatConfig: VatConfig;
  vatStream: DuplexStream<VatCommandReply, VatCommand>;
  kernelStore: KernelStore;
  logger?: Logger | undefined;
};

export class VatHandle {
  /** The ID of the vat this is the VatHandle for */
  readonly vatId: VatId;

  /** Communications channel to and from the vat itself */
  readonly #vatStream: DuplexStream<VatCommandReply, VatCommand>;

  /** The vat's configuration */
  readonly config: VatConfig;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger;

  /** Counter for associating messages to the vat with their replies */
  readonly #messageCounter: () => number;

  /** Storage holding the kernel's persistent state */
  readonly #kernelStore: KernelStore;

  /** Storage holding this vat's persistent state */
  readonly #vatStore: VatStore;

  /** The kernel we are working for. */
  readonly #kernel: Kernel;

  /** Callbacks to handle message replies, indexed by message id */
  readonly #unresolvedMessages: Map<VatCommand['id'], PromiseCallbacks> =
    new Map();

  /**
   * Construct a new VatHandle instance.
   *
   * @param params - Named constructor parameters.
   * @param params.kernel - The kernel.
   * @param params.vatId - Our vat ID.
   * @param params.vatConfig - The configuration for this vat.
   * @param params.vatStream - Communications channel connected to the vat worker.
   * @param params.kernelStore - The kernel's persistent state store.
   * @param params.logger - Optional logger for error and diagnostic output.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor({
    kernel,
    vatId,
    vatConfig,
    vatStream,
    kernelStore,
    logger,
  }: VatConstructorProps) {
    this.#kernel = kernel;
    this.vatId = vatId;
    this.config = vatConfig;
    this.#logger = logger ?? makeLogger(`[vat ${vatId}]`);
    this.#messageCounter = makeCounter();
    this.#vatStream = vatStream;
    this.#kernelStore = kernelStore;
    this.#vatStore = kernelStore.makeVatStore(vatId);
  }

  /**
   * Create a new VatHandle instance.
   *
   * @param params - Named constructor parameters.
   * @param params.kernel - The kernel.
   * @param params.vatId - Our vat ID.
   * @param params.vatConfig - The configuration for this vat.
   * @param params.vatStream - Communications channel connected to the vat worker.
   * @param params.kernelStore - The kernel's persistent state store.
   * @param params.logger - Optional logger for error and diagnostic output.
   * @returns A promise for the new VatHandle instance.
   */
  static async make({
    kernel,
    vatId,
    vatConfig,
    vatStream,
    kernelStore,
    logger,
  }: VatConstructorProps): Promise<VatHandle> {
    const vat = new VatHandle({
      kernel,
      vatId,
      vatConfig,
      vatStream,
      kernelStore,
      logger,
    });
    await vat.#init();
    return vat;
  }

  /**
   * Initializes the vat.
   *
   * @returns A promise that resolves when the vat is initialized.
   */
  async #init(): Promise<void> {
    Promise.all([this.#vatStream.drain(this.handleMessage.bind(this))]).catch(
      async (error) => {
        this.#logger.error(`Unexpected read error`, error);
        await this.terminate(
          true,
          new StreamReadError({ vatId: this.vatId }, error),
        );
      },
    );

    await this.sendVatCommand({
      method: VatCommandMethod.initVat,
      params: { vatConfig: this.config, state: this.#vatStore.getKVData() },
    });
  }

  /**
   * Translate a reference from vat space into kernel space.
   *
   * @param vref - The VRef of the entity of interest.
   *
   * @returns the KRef corresponding to `vref` in this vat.
   */
  #translateRefVtoK(vref: VRef): KRef {
    let kref = this.#kernelStore.erefToKref(this.vatId, vref);
    if (!kref) {
      kref = this.#kernel.exportFromVat(this.vatId, vref);
    }
    return kref;
  }

  /**
   * Translate a capdata object from vat space into kernel space.
   *
   * @param capdata - The object to be translated.
   *
   * @returns a translated copy of `capdata` intelligible to the kernel.
   */
  #translateCapDataVtoK(capdata: CapData<VRef>): CapData<KRef> {
    const slots: KRef[] = [];
    for (const slot of capdata.slots) {
      slots.push(this.#translateRefVtoK(slot));
    }
    return { body: capdata.body, slots };
  }

  /**
   * Translate a message from vat space into kernel space.
   *
   * @param message - The message to be translated.
   *
   * @returns a translated copy of `message` intelligible to the kernel.
   */
  #translateMessageVtoK(message: Message): Message {
    const methargs = this.#translateCapDataVtoK(
      message.methargs as CapData<VRef>,
    );
    if (typeof message.result !== 'string') {
      throw TypeError(`message result must be a string`);
    }
    const result = this.#translateRefVtoK(message.result);
    return { methargs, result };
  }

  /**
   * Translate a syscall from vat space into kernel space.
   *
   * @param vso - The syscall object to be translated.
   *
   * @returns a translated copy of `vso` intelligible to the kernel.
   */
  #translateSyscallVtoK(vso: VatSyscallObject): VatSyscallObject {
    let kso: VatSyscallObject;
    switch (vso[0]) {
      case 'send': {
        // [VRef, Message];
        const [op, target, message] = vso;
        kso = [
          op,
          this.#translateRefVtoK(target),
          this.#translateMessageVtoK(message),
        ];
        break;
      }
      case 'subscribe': {
        // [VRef];
        const [op, promise] = vso;
        kso = [op, this.#translateRefVtoK(promise)];
        break;
      }
      case 'resolve': {
        // [VatOneResolution[]];
        const [op, resolutions] = vso;
        const kResolutions: VatOneResolution[] = resolutions.map(
          (resolution) => {
            const [vpid, rejected, data] = resolution;
            return [
              this.#translateRefVtoK(vpid),
              rejected,
              this.#translateCapDataVtoK(data as CapData<VRef>),
            ];
          },
        );
        kso = [op, kResolutions];
        break;
      }
      case 'exit': {
        // [boolean, SwingSetCapData];
        const [op, isFailure, info] = vso;
        kso = [
          op,
          isFailure,
          this.#translateCapDataVtoK(info as CapData<VRef>),
        ];
        break;
      }
      case 'dropImports':
      case 'retireImports':
      case 'retireExports':
      case 'abandonExports': {
        // [VRef[]];
        const [op, vrefs] = vso;
        const krefs = vrefs.map((ref) => this.#translateRefVtoK(ref));
        kso = [op, krefs];
        break;
      }
      case 'callNow':
      case 'vatstoreGet':
      case 'vatstoreGetNextKey':
      case 'vatstoreSet':
      case 'vatstoreDelete': {
        const [op] = vso;
        throw Error(`vat ${this.vatId} issued invalid syscall ${op}`);
      }
      default: {
        // Compile-time exhaustiveness check
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw Error(`vat ${this.vatId} issued unknown syscall ${vso[0]}`);
      }
    }
    return kso;
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
    this.#kernel.enqueueRun(messageItem);
  }

  /**
   * Handle a 'resolve' syscall from the vat.
   *
   * @param resolutions - One or more promise resolutions.
   */
  #handleSyscallResolve(resolutions: VatOneResolution[]): void {
    this.#kernel.doResolve(this.vatId, resolutions);
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
      this.#kernel.notify(this.vatId, kpid);
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
  async #handleSyscall(vso: VatSyscallObject): Promise<void> {
    const kso: VatSyscallObject = this.#translateSyscallVtoK(vso);
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

  /**
   * Handle a message from the vat.
   *
   * @param message - The message to handle.
   * @param message.id - The id of the message.
   * @param message.payload - The payload (i.e., the message itself) to handle.
   */
  async handleMessage({ id, payload }: VatCommandReply): Promise<void> {
    // Syscalls are currently the only messages that actually originate from the
    // vat. All others will be replies to messages originally sent by the kernel TO the
    // vat.
    if (payload.method === VatCommandMethod.syscall) {
      await this.#handleSyscall(payload.params as VatSyscallObject);
    } else {
      let result;
      if (
        payload.method === VatCommandMethod.deliver ||
        payload.method === VatCommandMethod.initVat
      ) {
        result = null;
        const [sets, deletes] = payload.params;
        this.#vatStore.updateKVData(sets, deletes);
      } else {
        result = payload.params;
      }
      const promiseCallbacks = this.#unresolvedMessages.get(id);
      if (promiseCallbacks === undefined) {
        this.#logger.error(`No unresolved message with id "${id}".`);
      } else {
        this.#unresolvedMessages.delete(id);
        promiseCallbacks.resolve(result);
      }
    }
  }

  /**
   * Make a 'message' delivery to the vat.
   *
   * @param target - The VRef of the object to which the message is addressed.
   * @param message - The message to deliver.
   */
  async deliverMessage(target: VRef, message: Message): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['message', target, message],
    });
  }

  /**
   * Make a 'notify' delivery to the vat.
   *
   * @param resolutions - One or more promise resolutions to deliver.
   */
  async deliverNotify(resolutions: VatOneResolution[]): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['notify', resolutions],
    });
  }

  /**
   * Make a 'dropExports' delivery to the vat.
   *
   * @param krefs - The KRefs of the exports to be dropped.
   */
  async deliverDropExports(krefs: KRef[]): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['dropExports', krefs],
    });
  }

  /**
   * Make a 'retireExports' delivery to the vat.
   *
   * @param krefs - The KRefs of the exports to be retired.
   */
  async deliverRetireExports(krefs: KRef[]): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['retireExports', krefs],
    });
  }

  /**
   * Make a 'retireImports' delivery to the vat.
   *
   * @param krefs - The KRefs of the imports to be retired.
   */
  async deliverRetireImports(krefs: KRef[]): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['retireImports', krefs],
    });
  }

  /**
   * Make a 'bringOutYourDead' delivery to the vat.
   */
  async deliverBringOutYourDead(): Promise<void> {
    await this.sendVatCommand({
      method: VatCommandMethod.deliver,
      params: ['bringOutYourDead'],
    });
  }

  /**
   * Terminates the vat.
   *
   * @param terminating - If true, the vat is being killed permanently, so clean
   *   up its state and reject any promises that would be left dangling.
   * @param error - The error to terminate the vat with.
   */
  async terminate(terminating: boolean, error?: Error): Promise<void> {
    await this.#vatStream.end(error);

    if (terminating) {
      // Reject promises exported to other vats for which this vat is the decider
      const failure = kser(new VatDeletedError(this.vatId));
      for (const kpid of this.#kernelStore.getPromisesByDecider(this.vatId)) {
        this.#kernel.doResolve(this.vatId, [[kpid, true, failure]]);
      }

      // Reject promises for results of method invocations from the kernel
      for (const [messageId, promiseCallback] of this.#unresolvedMessages) {
        promiseCallback?.reject(error ?? new VatDeletedError(this.vatId));
        this.#unresolvedMessages.delete(messageId);
      }

      // Expunge this vat's persistent state
      this.#kernelStore.deleteVat(this.vatId);
    }
  }

  /**
   * Send a command into the vat.
   *
   * @param payload - The command to send.
   * @returns A promise that resolves the response to the command.
   */
  async sendVatCommand<Method extends VatCommand['payload']['method']>(
    payload: Extract<VatCommand['payload'], { method: Method }>,
  ): Promise<VatCommandReturnType[Method]> {
    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextMessageId();
    this.#unresolvedMessages.set(messageId, { reject, resolve });
    await this.#vatStream.write({ id: messageId, payload });
    return promise as Promise<VatCommandReturnType[Method]>;
  }

  /**
   * Gets the next message ID.
   *
   * @returns The message ID.
   */
  readonly #nextMessageId = (): VatCommand['id'] => {
    return `${this.vatId}:${this.#messageCounter()}`;
  };
}
