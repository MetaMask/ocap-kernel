import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { VatDeletedError, StreamReadError } from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger, makeCounter } from '@ocap/utils';
// XXX Reenable the following once the packaging of liveslots is fixed (and at
// the same time remove the below import of ./ag-types.js)
// import type { VatSyscallObject } from '@agoric/swingset-liveslots';

import type {
  Message,
  VatSyscallObject,
  VatOneResolution,
} from './ag-types.js';
import type { Kernel } from './Kernel.js';
import { VatCommandMethod } from './messages/index.js';
import type {
  VatCommandReply,
  VatCommand,
  VatCommandReturnType,
} from './messages/index.js';
import type { KernelStore } from './store/kernel-store.js';
import type {
  PromiseCallbacks,
  VatId,
  VatConfig,
  VRef,
  KRef,
  RunQueueItemSend,
} from './types.js';

type VatConstructorProps = {
  kernel: Kernel;
  vatId: VatId;
  vatConfig: VatConfig;
  commandStream: DuplexStream<VatCommandReply, VatCommand>;
  storage: KernelStore;
  logger?: Logger | undefined;
};

export class VatHandle {
  readonly vatId: VatConstructorProps['vatId'];

  readonly #commandStream: DuplexStream<VatCommandReply, VatCommand>;

  readonly config: VatConstructorProps['vatConfig'];

  readonly logger: Logger;

  readonly #messageCounter: () => number;

  readonly #storage: KernelStore;

  readonly #kernel: Kernel;

  readonly unresolvedMessages: Map<VatCommand['id'], PromiseCallbacks> =
    new Map();

  constructor({
    kernel,
    vatId,
    vatConfig,
    commandStream,
    logger,
    storage,
  }: VatConstructorProps) {
    this.#kernel = kernel;
    this.vatId = vatId;
    this.config = vatConfig;
    this.logger = logger ?? makeLogger(`[vat ${vatId}]`);
    this.#messageCounter = makeCounter();
    this.#commandStream = commandStream;
    this.#storage = storage;
  }

  #translateRefVtoK(vref: VRef): KRef {
    let kref = this.#storage.erefToKref(this.vatId, vref) as KRef;
    if (!kref) {
      kref = this.#kernel.exportFromVat(this.vatId, vref);
    }
    return kref;
  }

  #translateCapDataVtoK(capdata: CapData<VRef>): CapData<KRef> {
    const slots: KRef[] = [];
    for (const slot of capdata.slots) {
      slots.push(this.#translateRefVtoK(slot));
    }
    return { body: capdata.body, slots };
  }

  #handleSyscallSend(target: KRef, message: Message): void {
    const messageItem: RunQueueItemSend = {
      type: 'send',
      target,
      message,
    };
    this.#kernel.enqueueRun(messageItem);
  }

  #handleSyscallResolve(resolutions: VatOneResolution[]): void {
    this.#kernel.doResolve(this.vatId, resolutions);
  }

  #handleSyscallSubscribe(kpid: KRef): void {
    this.#storage.addPromiseSubscriber(this.vatId, kpid);
  }

  translateSyscallVtoK(vso: VatSyscallObject): VatSyscallObject {
    let kso: VatSyscallObject;
    switch (vso[0]) {
      case 'send': {
        // [VRef, Message];
        const [op, target, message] = vso;
        const kMethargs = this.#translateCapDataVtoK(
          message.methargs as CapData<VRef>,
        );
        const kResult = this.#translateRefVtoK(message.result as VRef);
        const kMessage = { methargs: kMethargs, result: kResult };
        kso = [op, this.#translateRefVtoK(target as VRef), kMessage];
        break;
      }
      case 'subscribe': {
        // [VRef];
        const [op, promise] = vso;
        kso = [op, this.#translateRefVtoK(promise as VRef)];
        break;
      }
      case 'resolve': {
        // [VatOneResolution[]];
        const [op, resolutions] = vso;
        const kResolutions: VatOneResolution[] = resolutions.map(
          (resolution) => {
            const [vpid, rejected, data] = resolution;
            return [
              this.#translateRefVtoK(vpid as VRef),
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
        const krefs = vrefs.map((ref) => this.#translateRefVtoK(ref as VRef));
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
        // Runtime does not respect "never".
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw Error(`vat ${this.vatId} issued unknown syscall ${vso[0]}`);
      }
    }
    return kso;
  }

  async #handleSyscall(vso: VatSyscallObject): Promise<void> {
    const kso: VatSyscallObject = this.translateSyscallVtoK(vso);
    const [op] = kso;
    const { vatId } = this;
    const { log } = console;
    switch (op) {
      case 'send': {
        // [KRef, Message];
        const [, rawTarget, message] = kso;
        const target = rawTarget as KRef;
        log(`@@@@ ${vatId} syscall send ${target}<-${JSON.stringify(message)}`);
        this.#handleSyscallSend(target, message);
        break;
      }
      case 'subscribe': {
        // [KRef];
        const [, rawPromise] = kso;
        const promise = rawPromise as KRef;
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
        break;
      }
      case 'retireImports': {
        // [KRef[]];
        const [, refs] = kso;
        log(`@@@@ ${vatId} syscall retireImports ${JSON.stringify(refs)}`);
        break;
      }
      case 'retireExports': {
        // [KRef[]];
        const [, refs] = kso;
        log(`@@@@ ${vatId} syscall retireExports ${JSON.stringify(refs)}`);
        break;
      }
      case 'abandonExports': {
        // [KRef[]];
        const [, refs] = kso;
        log(`@@@@ ${vatId} syscall abandonExports ${JSON.stringify(refs)}`);
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
        // Runtime does not respect "never".
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        console.warn(`vat ${vatId} issued unknown syscall ${op} `, vso);
        break;
    }
  }

  /**
   * Handle a message from the parent window.
   *
   * @param vatMessage - The vat message to handle.
   * @param vatMessage.id - The id of the message.
   * @param vatMessage.payload - The payload to handle.
   */
  async handleMessage({ id, payload }: VatCommandReply): Promise<void> {
    if (payload.method === VatCommandMethod.syscall) {
      await this.#handleSyscall(payload.params);
    } else {
      const promiseCallbacks = this.unresolvedMessages.get(id);
      if (promiseCallbacks === undefined) {
        this.logger.error(`No unresolved message with id "${id}".`);
      } else {
        this.unresolvedMessages.delete(id);
        promiseCallbacks.resolve(payload.params);
      }
    }
  }

  /**
   * Initializes the vat.
   *
   * @returns A promise that resolves when the vat is initialized.
   */
  async init(): Promise<void> {
    Promise.all([
      this.#commandStream.drain(this.handleMessage.bind(this)),
    ]).catch(async (error) => {
      this.logger.error(`Unexpected read error`, error);
      await this.terminate(new StreamReadError({ vatId: this.vatId }, error));
    });

    await this.sendMessage({ method: VatCommandMethod.ping, params: null });
    await this.sendMessage({
      method: VatCommandMethod.initVat,
      params: this.config,
    });
    this.logger.debug('Created');
  }

  async deliverMessage(target: VRef, message: Message): Promise<void> {
    await this.sendMessage({
      method: VatCommandMethod.deliver,
      params: ['message', target, message],
    });
  }

  async deliverNotify(resolutions: VatOneResolution[]): Promise<void> {
    await this.sendMessage({
      method: VatCommandMethod.deliver,
      params: ['notify', resolutions],
    });
  }

  /**
   * Terminates the vat.
   *
   * @param error - The error to terminate the vat with.
   */
  async terminate(error?: Error): Promise<void> {
    await this.#commandStream.end(error);

    // Handle orphaned messages
    for (const [messageId, promiseCallback] of this.unresolvedMessages) {
      promiseCallback?.reject(error ?? new VatDeletedError(this.vatId));
      this.unresolvedMessages.delete(messageId);
    }
  }

  /**
   * Send a message to a vat.
   *
   * @param payload - The message to send.
   * @returns A promise that resolves the response to the message.
   */
  async sendMessage<Method extends VatCommand['payload']['method']>(
    payload: Extract<VatCommand['payload'], { method: Method }>,
  ): Promise<VatCommandReturnType[Method]> {
    this.logger.debug('Sending message to vat', payload);
    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextMessageId();
    this.unresolvedMessages.set(messageId, { reject, resolve });
    await this.#commandStream.write({ id: messageId, payload });
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
