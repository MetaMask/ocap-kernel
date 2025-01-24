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
  vatStream: DuplexStream<VatCommandReply, VatCommand>;
  storage: KernelStore;
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
  readonly #storage: KernelStore;

  /** The kernel we are working for. */
  readonly #kernel: Kernel;

  /** Callbacks to handle message replies, indexed by message id */
  readonly unresolvedMessages: Map<VatCommand['id'], PromiseCallbacks> =
    new Map();

  /**
   * Construct a new VatHandle instance.
   *
   * @param params - Named constructor parameters.
   * @param params.kernel - The kernel.
   * @param params.vatId - Our vat ID.
   * @param params.vatConfig - The configuration for this vat.
   * @param params.vatStream - Communications channel connected to the vat worker.
   * @param params.storage - The kernel's persistent state store.
   * @param params.logger - Optional logger for error and diagnostic output.
   */
  constructor({
    kernel,
    vatId,
    vatConfig,
    vatStream,
    storage,
    logger,
  }: VatConstructorProps) {
    this.#kernel = kernel;
    this.vatId = vatId;
    this.config = vatConfig;
    this.#logger = logger ?? makeLogger(`[vat ${vatId}]`);
    this.#messageCounter = makeCounter();
    this.#vatStream = vatStream;
    this.#storage = storage;
  }

  /**
   * Translate a reference from vat space into kernel space.
   *
   * @param vref - The VRef of the entity of interest.
   *
   * @returns the KRef corresponding to `vref` in this vat.
   */
  #translateRefVtoK(vref: VRef): KRef {
    let kref = this.#storage.erefToKref(this.vatId, vref);
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
    this.#storage.addPromiseSubscriber(this.vatId, kpid);
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
    if (payload.method === VatCommandMethod.syscall) {
      await this.#handleSyscall(payload.params);
    } else {
      const promiseCallbacks = this.unresolvedMessages.get(id);
      if (promiseCallbacks === undefined) {
        this.#logger.error(`No unresolved message with id "${id}".`);
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
    Promise.all([this.#vatStream.drain(this.handleMessage.bind(this))]).catch(
      async (error) => {
        this.#logger.error(`Unexpected read error`, error);
        await this.terminate(new StreamReadError({ vatId: this.vatId }, error));
      },
    );

    this.#logger.debug('pinging...');
    await this.sendMessage({ method: VatCommandMethod.ping, params: null });
    this.#logger.debug('pinged!');
    await this.sendMessage({
      method: VatCommandMethod.initVat,
      params: this.config,
    });
    this.#logger.debug('Created');
  }

  /**
   * Make a 'message' delivery to the vat.
   *
   * @param target - The VRef of the object to which the message is addressed.
   * @param message - The message to deliver.
   */
  async deliverMessage(target: VRef, message: Message): Promise<void> {
    await this.sendMessage({
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
    await this.#vatStream.end(error);

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
    this.#logger.debug('Sending message to vat', payload);
    const { promise, reject, resolve } = makePromiseKit();
    const messageId = this.#nextMessageId();
    this.unresolvedMessages.set(messageId, { reject, resolve });
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
