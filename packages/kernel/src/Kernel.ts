import type { Message, VatOneResolution } from '@agoric/swingset-liveslots';
import { passStyleOf } from '@endo/far';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import {
  StreamReadError,
  VatAlreadyExistsError,
  VatNotFoundError,
} from '@ocap/errors';
import type { KVStore } from '@ocap/store';
import type { DuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';

import { assert, Fail } from './assert.js';
import { kser, kunser, krefOf, kslot } from './kernel-marshal.js';
import type { SlotValue } from './kernel-marshal.js';
import { isKernelCommand, KernelCommandMethod } from './messages/index.js';
import type {
  KernelCommand,
  KernelCommandReply,
  VatCommand,
  VatCommandReturnType,
} from './messages/index.js';
import {
  parseRef,
  isPromiseRef,
  makeKernelStore,
} from './store/kernel-store.js';
import type { KernelStore } from './store/kernel-store.js';
import type {
  VatId,
  VRef,
  KRef,
  VatWorkerService,
  ClusterConfig,
  VatConfig,
  RunQueueItem,
  RunQueueItemSend,
  RunQueueItemNotify,
} from './types.js';
import {
  ROOT_OBJECT_VREF,
  insistVatId,
  insistMessage,
  isClusterConfig,
} from './types.js';
import { VatHandle } from './VatHandle.js';

/**
 * Obtain the KRef from a simple value represented as a CapData object.
 *
 * @param data - The data object to be examined.
 * @returns the single KRef that is `data`, or null if it isn't one.
 */
function extractSingleRef(data: CapData<KRef>): KRef | null {
  const value = kunser(data) as SlotValue;
  const style: string = passStyleOf(value);
  if (style === 'remotable' || style === 'promise') {
    return krefOf(value);
  }
  return null;
}

type MessageRoute = {
  vatId?: VatId;
  target: KRef;
} | null;

export class Kernel {
  /** Command channel from the controlling console/browser extension/test driver */
  readonly #commandStream: DuplexStream<KernelCommand, KernelCommandReply>;

  /** Currently running vats, by ID */
  readonly #vats: Map<VatId, VatHandle>;

  /** Service to spawn workers (in iframes) for vats to run in */
  readonly #vatWorkerService: VatWorkerService;

  /** Storage holding the kernel's persistent state */
  readonly #storage: KernelStore;

  /** Logger for outputting messages (such as errors) to the console */
  readonly #logger: Logger;

  /** Count of currently pending entries in the kernel's run queue */
  #runQueueLength: number;

  /** Thunk to signal run queue transition from empty to non-empty */
  #wakeUpTheRunQueue: (() => void) | null;

  /** Configuration of the most recently launched vat subcluster (for debug purposes) */
  #mostRecentSubcluster: ClusterConfig | null;

  /** Message results that the kernel itself has subscribed to */
  readonly #kernelSubscriptions: Map<KRef, (value: CapData<KRef>) => void> =
    new Map();

  /**
   * Construct a new kernel instance.
   *
   * @param commandStream - Command channel from whatever external software is driving the kernel.
   * @param vatWorkerService - Service to create a worker in which a new vat can run.
   * @param rawStorage - A KV store for holding the kernel's persistent state.
   * @param options - Options for the kernel constructor.
   * @param options.resetStorage - If true, the storage will be cleared.
   * @param options.logger - Optional logger for error and diagnostic output.
   */
  constructor(
    commandStream: DuplexStream<KernelCommand, KernelCommandReply>,
    vatWorkerService: VatWorkerService,
    rawStorage: KVStore,
    options: {
      resetStorage?: boolean;
      logger?: Logger;
    } = {},
  ) {
    this.#mostRecentSubcluster = null;
    this.#commandStream = commandStream;
    this.#vats = new Map();
    this.#vatWorkerService = vatWorkerService;

    if (options.resetStorage) {
      rawStorage.clear();
    }

    this.#storage = makeKernelStore(rawStorage);
    this.#logger = options.logger ?? makeLogger('[ocap kernel]');
    this.#runQueueLength = this.#storage.runQueueLength();
    this.#wakeUpTheRunQueue = null;
  }

  /**
   * Start the kernel running. Sets it up to actually receive command messages
   * and then begin processing the run queue.
   */
  async init(): Promise<void> {
    this.#receiveCommandMessages().catch((error) => {
      this.#logger.error('Stream read error occurred:', error);
      // Errors thrown here will not be surfaced in the usual synchronous manner
      // because #receiveCommandMessages() is not awaited.  Any error thrown
      // inside the async loop is 'caught' within the constructor call context
      // but will be displayed as 'Uncaught (in promise)' since they occur after
      // the constructor has returned.
      throw new StreamReadError({ kernelId: 'kernel' }, error);
    });
    // eslint-disable-next-line no-void
    void this.#run();
  }

  /**
   * The kernel's run loop: take an item off the run queue, deliver it,
   * repeat. Note that this loops forever: the returned promise never resolves.
   */
  async #run(): Promise<void> {
    for await (const item of this.#runQueueItems()) {
      await this.#deliver(item);
    }
  }

  /**
   * Async generator that yields the items from the kernel run queue, in order.
   *
   * @yields the next item in the run queue.
   */
  async *#runQueueItems(): AsyncGenerator<RunQueueItem> {
    for (;;) {
      while (this.#runQueueLength > 0) {
        const item = this.#dequeueRun();
        if (item) {
          yield item;
        } else {
          break;
        }
      }
      if (this.#runQueueLength === 0) {
        const { promise, resolve } = makePromiseKit<void>();
        if (this.#wakeUpTheRunQueue !== null) {
          Fail`wakeUpTheRunQueue function already set`;
        }
        this.#wakeUpTheRunQueue = resolve;
        await promise;
      }
    }
  }

  /**
   * Process messages received over the command channel.
   *
   * Note that all the messages currently handled here are for interactive
   * testing support, not for normal operation or control of the kernel. We
   * expect that in the fullness of time the command protocol will expand to
   * include actual operational functions, while the things that are mere test
   * scaffolding will be removed.
   */
  async #receiveCommandMessages(): Promise<void> {
    for await (const message of this.#commandStream) {
      if (!isKernelCommand(message)) {
        this.#logger.error('Received unexpected message', message);
        continue;
      }

      const { method, params } = message;

      switch (method) {
        case KernelCommandMethod.ping:
          await this.#replyToCommand({ method, params: 'pong' });
          break;
        default:
          console.error(
            'kernel worker received unexpected command',
            // @ts-expect-error Compile-time exhaustiveness check
            { method: method.valueOf(), params },
          );
      }
    }
  }

  /**
   * Transmit the reply to a command back to its requestor.
   *
   * @param message - The reply message to send.
   */
  async #replyToCommand(message: KernelCommandReply): Promise<void> {
    await this.#commandStream.write(message);
  }

  /**
   * Create the kernel's representation of an export from a vat.
   *
   * @param vatId - The vat doing the exporting.
   * @param vref - The vat's ref for the entity in queestion.
   *
   * @returns the kref corresponding to the export of `vref` from `vatId`.
   */
  exportFromVat(vatId: VatId, vref: VRef): KRef {
    insistVatId(vatId);
    const { isPromise, context, direction } = parseRef(vref);
    assert(context === 'vat', `${vref} is not a VRef`);
    assert(direction === 'export', `${vref} is not an export reference`);
    let kref;
    if (isPromise) {
      kref = this.#storage.initKernelPromise()[0];
      this.#storage.setPromiseDecider(kref, vatId);
    } else {
      kref = this.#storage.initKernelObject(vatId);
    }
    this.#storage.addClistEntry(vatId, kref, vref);
    return kref;
  }

  /**
   * Gets a list of the IDs of all running vats.
   *
   * XXX Question: is this usefully different from `getVats`?
   *
   * @returns An array of vat IDs.
   */
  getVatIds(): VatId[] {
    return Array.from(this.#vats.keys());
  }

  /**
   * Gets a list of information about all running vats.
   *
   * @returns An array of vat information records.
   */
  getVats(): {
    id: VatId;
    config: VatConfig;
  }[] {
    return Array.from(this.#vats.values()).map((vat) => ({
      id: vat.vatId,
      config: vat.config,
    }));
  }

  /**
   * Start a new or resurrected vat running.
   *
   * @param vatId - The ID of the vat to start.
   * @param vatConfig - Its configuration.
   *
   * @returns a promise for the KRef of the vat's root object.
   */
  async #startVat(vatId: VatId, vatConfig: VatConfig): Promise<KRef> {
    if (this.#vats.has(vatId)) {
      throw new VatAlreadyExistsError(vatId);
    }
    const commandStream = await this.#vatWorkerService.launch(vatId, vatConfig);
    const vat = new VatHandle({
      kernel: this,
      vatId,
      vatConfig,
      vatStream: commandStream,
      storage: this.#storage,
    });
    this.#vats.set(vatId, vat);
    this.#storage.initEndpoint(vatId);
    await vat.init();
    const rootRef = this.exportFromVat(vatId, ROOT_OBJECT_VREF);
    return rootRef;
  }

  /**
   * Launches a vat.
   *
   * @param vatConfig - Configuration for the new vat.
   *
   * @returns a promise for the KRef of the new vat's root object.
   */
  async launchVat(vatConfig: VatConfig): Promise<KRef> {
    return this.#startVat(this.#storage.getNextVatId(), vatConfig);
  }

  /**
   * Translate a reference from kernel space into vat space.
   *
   * @param vatId - The vat for whom translation is desired.
   * @param kref - The KRef of the entity of interest.
   * @param importIfNeeded - If true, allocate a new clist entry if necessary;
   *   if false, require that such an entry already exist.
   *
   * @returns the VRef corresponding to `kref` in `vatId`.
   */
  #translateRefKtoV(vatId: VatId, kref: KRef, importIfNeeded: boolean): VRef {
    let eref = this.#storage.krefToEref(vatId, kref);
    if (!eref) {
      if (importIfNeeded) {
        eref = this.#storage.allocateErefForKref(vatId, kref);
      } else {
        throw Fail`unmapped kref ${kref} vat=${vatId}`;
      }
    }
    return eref;
  }

  /**
   * Translate a capdata object from kernel space into vat space.
   *
   * @param vatId - The vat for whom translation is desired.
   * @param capdata - The object to be translated.
   *
   * @returns a translated copy of `capdata` intelligible to `vatId`.
   */
  #translateCapDataKtoV(vatId: VatId, capdata: CapData<KRef>): CapData<VRef> {
    const slots: VRef[] = [];
    for (const slot of capdata.slots) {
      slots.push(this.#translateRefKtoV(vatId, slot, true));
    }
    return { body: capdata.body, slots };
  }

  /**
   * Translate a message from kernel space into vat space.
   *
   * @param vatId - The vat for whom translation is desired.
   * @param message - The message to be translated.
   *
   * @returns a translated copy of `message` intelligible to `vatId`.
   */
  #translateMessageKtoV(vatId: VatId, message: Message): Message {
    const methargs = this.#translateCapDataKtoV(
      vatId,
      message.methargs as CapData<KRef>,
    );
    const result = message.result
      ? this.#translateRefKtoV(vatId, message.result, true)
      : message.result;
    const vatMessage = { ...message, methargs, result };
    return vatMessage;
  }

  /**
   * Add an item to the tail of the kernel's run queue.
   *
   * @param item - The item to add.
   */
  enqueueRun(item: RunQueueItem): void {
    this.#storage.enqueueRun(item);
    this.#runQueueLength += 1;
    if (this.#runQueueLength === 1 && this.#wakeUpTheRunQueue) {
      const wakeUpTheRunQueue = this.#wakeUpTheRunQueue;
      this.#wakeUpTheRunQueue = null;
      wakeUpTheRunQueue();
    }
  }

  /**
   * Remove an item from the head of the kernel's run queue and return it.
   *
   * @returns the next item in the run queue, or undefined if the queue is empty.
   */
  #dequeueRun(): RunQueueItem | undefined {
    this.#runQueueLength -= 1;
    const result = this.#storage.dequeueRun();
    return result;
  }

  /**
   * Determine a message's destination route based on the target type and
   * state. In the most general case, this route consists of a vatId and a
   * destination object reference.
   *
   * There are three possible outcomes:
   * - splat: message should be dropped (with optional error resolution),
   *   indicated by a null return value
   * - send: message should be delivered to a specific object in a specific vat
   * - requeue: message should be put back on the run queue for later delivery
   *   (for unresolved promises), indicated by absence of a target vat in the
   *   return value
   *
   * @param item - The message to route.
   * @returns the route for the message.
   */
  #routeMessage(item: RunQueueItemSend): MessageRoute {
    const { target, message } = item;
    insistMessage(message);

    const routeAsSplat = (error?: CapData<KRef>): MessageRoute => {
      if (message.result && error) {
        this.doResolve(undefined, [[message.result, true, error]]);
      }
      return null;
    };
    const routeAsSend = (targetObject: KRef): MessageRoute => {
      const vatId = this.#storage.getOwner(targetObject);
      if (!vatId) {
        return routeAsSplat(kser('no vat'));
      }
      return { vatId, target: targetObject };
    };
    const routeAsRequeue = (targetObject: KRef): MessageRoute => {
      return { target: targetObject };
    };

    if (isPromiseRef(target)) {
      const promise = this.#storage.getKernelPromise(target);
      switch (promise.state) {
        case 'fulfilled': {
          if (promise.value) {
            const targetObject = extractSingleRef(promise.value);
            if (targetObject) {
              if (isPromiseRef(targetObject)) {
                return routeAsRequeue(targetObject);
              }
              return routeAsSend(targetObject);
            }
          }
          return routeAsSplat(kser('no object'));
        }
        case 'rejected':
          return routeAsSplat(promise.value);
        case 'unresolved':
          return routeAsRequeue(target);
        default:
          throw Fail`unknown promise state ${promise.state}`;
      }
    } else {
      return routeAsSend(target);
    }
  }

  /**
   * Deliver a run queue item to its target.
   *
   * If the item being delivered is message whose target is a promise, it is
   * delivered based on the kernel's model of the promise's state:
   * - unresolved: it is put onto the queue that the kernel maintains for that promise
   * - fulfilled: it is forwarded to the promise resolution target
   * - rejected: the result promise of the message is in turn rejected according
   *   to the kernel's model of the promise's rejection value
   *
   * If the item being delivered is a notification, the kernel's model of the
   * state of the promise being notified is updated, and any queue items
   * enqueued for that promise are placed onto the run queue. The notification
   * is also forwarded to all of the promise's registered subscribers.
   *
   * @param item - The message/notification to deliver.
   */
  async #deliver(item: RunQueueItem): Promise<void> {
    const { log } = console;
    switch (item.type) {
      case 'send': {
        const route = this.#routeMessage(item);
        if (route) {
          const { vatId, target } = route;
          const { message } = item;
          log(
            `@@@@ deliver ${vatId} send ${target}<-${JSON.stringify(message)}`,
          );
          if (vatId) {
            const vat = this.#getVat(vatId);
            if (vat) {
              if (message.result) {
                if (typeof message.result !== 'string') {
                  throw TypeError('message result must be a string');
                }
                this.#storage.setPromiseDecider(message.result, vatId);
              }
              const vatTarget = this.#translateRefKtoV(vatId, target, false);
              const vatMessage = this.#translateMessageKtoV(vatId, message);
              await vat.deliverMessage(vatTarget, vatMessage);
            } else {
              Fail`no owner for kernel object ${target}`;
            }
          } else {
            this.#storage.enqueuePromiseMessage(target, message);
          }
          log(`@@@@ done ${vatId} send ${target}<-${JSON.stringify(message)}`);
        }
        break;
      }
      case 'notify': {
        const { vatId, kpid } = item;
        insistVatId(vatId);
        const { context, isPromise } = parseRef(kpid);
        assert(
          context === 'kernel' && isPromise,
          `${kpid} is not a kernel promise`,
        );
        log(`@@@@ deliver ${vatId} notify ${kpid}`);
        const promise = this.#storage.getKernelPromise(kpid);
        const { state, value } = promise;
        assert(value, `no value for promise ${kpid}`);
        if (state === 'unresolved') {
          Fail`notification on unresolved promise ${kpid}`;
        }
        if (!this.#storage.krefToEref(vatId, kpid)) {
          // no c-list entry, already done
          return;
        }
        const targets = this.#getKpidsToRetire(kpid, value);
        if (targets.length === 0) {
          // no kpids to retire, already done
          return;
        }
        const resolutions: VatOneResolution[] = [];
        for (const toResolve of targets) {
          const tPromise = this.#storage.getKernelPromise(toResolve);
          if (tPromise.state === 'unresolved') {
            Fail`target promise ${toResolve} is unresolved`;
          }
          if (!tPromise.value) {
            throw Fail`target promise ${toResolve} has no value`;
          }
          resolutions.push([
            this.#translateRefKtoV(vatId, toResolve, true),
            false,
            this.#translateCapDataKtoV(vatId, tPromise.value),
          ]);
        }
        const vat = this.#getVat(vatId);
        await vat.deliverNotify(resolutions);
        log(`@@@@ done ${vatId} notify ${kpid}`);
        break;
      }
      default:
        // @ts-expect-error Runtime does not respect "never".
        Fail`unsupported or unknown run queue item type ${item.type}`;
    }
  }

  /**
   * Given a promise that has just been resolved and the value it resolved to,
   * find all promises reachable (recursively) from the new resolution value
   * which are themselves already resolved. This will determine the set of
   * resolutions that subscribers to the original promise will need to be
   * notified of.
   *
   * This is needed because subscription to a promise carries with it an implied
   * subscription to any promises that appear in its resolution value -- these
   * subscriptions must be implied rather than explicit because they are
   * necessarily unknown at the time of the original promise was subscribed to.
   *
   * @param origKpid - The original promise to start from.
   * @param origValue - The value the original promise is resolved to.
   * @returns An array of the kpids of the promises whose values become visible
   * as a consequence of the resolution of `origKpid`.
   */
  #getKpidsToRetire(origKpid: KRef, origValue: CapData<KRef>): KRef[] {
    const seen = new Set<KRef>();
    const scanPromise = (kpid: KRef, value: CapData<KRef>): void => {
      seen.add(kpid);
      if (value) {
        for (const slot of value.slots) {
          if (isPromiseRef(slot)) {
            if (!seen.has(slot)) {
              const promise = this.#storage.getKernelPromise(slot);
              if (promise.state !== 'unresolved') {
                if (promise.value) {
                  scanPromise(slot, promise.value);
                }
              }
            }
          }
        }
      }
    };
    scanPromise(origKpid, origValue);
    return Array.from(seen);
  }

  /**
   * Enqueue for delivery a notification to a vat about the resolution of a
   * promise.
   *
   * @param vatId - The vat that will be notified.
   * @param kpid - The promise of interest.
   */
  notify(vatId: VatId, kpid: KRef): void {
    const notifyItem: RunQueueItemNotify = { type: 'notify', vatId, kpid };
    this.enqueueRun(notifyItem);
  }

  /**
   * Process a set of promise resolutions coming from a vat.
   *
   * @param vatId - The vat doing the resolving, if there is one.
   * @param resolutions - One or more resolutions, to be processed as a group.
   */
  doResolve(vatId: VatId | undefined, resolutions: VatOneResolution[]): void {
    if (vatId) {
      insistVatId(vatId);
    }
    for (const resolution of resolutions) {
      const [kpid, rejected, dataRaw] = resolution;
      const data = dataRaw as CapData<KRef>;
      const promise = this.#storage.getKernelPromise(kpid);
      const { state, decider, subscribers } = promise;
      if (state !== 'unresolved') {
        Fail`${kpid} was already resolved`;
      }
      if (decider !== vatId) {
        const why = decider ? `its decider is ${decider}` : `it has no decider`;
        Fail`${vatId} not permitted to resolve ${kpid} because ${why}`;
      }
      if (!subscribers) {
        throw Fail`${kpid} subscribers not set`;
      }
      for (const subscriber of subscribers) {
        this.notify(subscriber, kpid);
      }
      this.#storage.resolveKernelPromise(kpid, rejected, data);
      const kernelResolve = this.#kernelSubscriptions.get(kpid);
      if (kernelResolve) {
        this.#kernelSubscriptions.delete(kpid);
        kernelResolve(data);
      }
    }
  }

  /**
   * Send a message from the kernel to an object in a vat.
   *
   * @param target - The object to which the message is directed.
   * @param method - The method to be invoked.
   * @param args - Message arguments.
   *
   * @returns a promise for the (CapData encoded) result of the message invocation.
   */
  async queueMessageFromKernel(
    target: KRef,
    method: string,
    args: unknown[],
  ): Promise<CapData<KRef>> {
    const result = this.#storage.initKernelPromise()[0];
    const message: Message = {
      methargs: kser([method, args]),
      result,
    };
    const queueItem: RunQueueItemSend = {
      type: 'send',
      target,
      message,
    };
    const { promise, resolve } = makePromiseKit<CapData<KRef>>();
    this.#kernelSubscriptions.set(result, resolve);
    this.enqueueRun(queueItem);
    return promise;
  }

  /**
   * Launches a sub-cluster of vats.
   *
   * @param config - Configuration object for sub-cluster.
   * @returns a promise for the (CapData encoded) result of the bootstrap message.
   */
  async launchSubcluster(
    config: ClusterConfig,
  ): Promise<CapData<KRef> | undefined> {
    isClusterConfig(config) || Fail`invalid cluster config`;
    if (config.bootstrap && !config.vats[config.bootstrap]) {
      Fail`invalid bootstrap vat name ${config.bootstrap}`;
    }
    this.#mostRecentSubcluster = config;
    const rootIds: Record<string, KRef> = {};
    const roots: Record<string, SlotValue> = {};
    for (const [vatName, vatConfig] of Object.entries(config.vats)) {
      const rootRef = await this.launchVat(vatConfig);
      rootIds[vatName] = rootRef;
      roots[vatName] = kslot(rootRef, 'vatRoot');
    }
    let resultP: Promise<CapData<KRef> | undefined> =
      Promise.resolve(undefined);
    if (config.bootstrap) {
      const bootstrapRoot = rootIds[config.bootstrap];
      if (bootstrapRoot) {
        resultP = this.queueMessageFromKernel(bootstrapRoot, 'bootstrap', [
          roots,
        ]);
      }
    }
    return resultP;
  }

  /**
   * Restarts a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns A promise for the restarted vat.
   */
  async restartVat(vatId: VatId): Promise<VatHandle> {
    const vat = this.#getVat(vatId);
    if (!vat) {
      throw new VatNotFoundError(vatId);
    }
    const { config } = vat;
    await this.terminateVat(vatId);
    await this.#startVat(vatId, config);
    return vat;
  }

  /**
   * Terminate a vat.
   *
   * @param vatId - The ID of the vat.
   */
  async terminateVat(vatId: VatId): Promise<void> {
    const vat = this.#getVat(vatId);
    if (!vat) {
      throw new VatNotFoundError(vatId);
    }
    await vat.terminate();
    await this.#vatWorkerService.terminate(vatId).catch(console.error);
    this.#vats.delete(vatId);
  }

  /**
   * Terminate all vats.
   */
  async terminateAllVats(): Promise<void> {
    await Promise.all(
      this.getVatIds().map(async (id) => {
        const vat = this.#getVat(id);
        await vat.terminate();
        this.#vats.delete(id);
      }),
    );
    await this.#vatWorkerService.terminateAll();
  }

  /**
   * Reload the kernel.
   */
  async reload(): Promise<void> {
    if (!this.#mostRecentSubcluster) {
      throw Error('no subcluster to reload');
    }

    await this.terminateAllVats();

    await this.launchSubcluster(this.#mostRecentSubcluster);
  }

  /**
   * Clear the database.
   */
  async clearStorage(): Promise<void> {
    this.#storage.reset();
  }

  /**
   * Send a command to a vat.
   *
   * @param id - The id of the vat to send the command to.
   * @param command - The command to send.
   * @returns A promise that resolves the response to the command.
   */
  async sendVatCommand<Method extends VatCommand['payload']['method']>(
    id: VatId,
    command: Extract<VatCommand['payload'], { method: Method }>,
  ): Promise<VatCommandReturnType[Method]> {
    const vat = this.#getVat(id);
    return vat.sendVatCommand(command);
  }

  /**
   * Reset the kernel state.
   */
  async reset(): Promise<void> {
    await this.terminateAllVats();
    this.#storage.reset();
  }

  /**
   * Get a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns the vat's VatHandle.
   */
  #getVat(vatId: VatId): VatHandle {
    const vat = this.#vats.get(vatId);
    if (vat === undefined) {
      throw new VatNotFoundError(vatId);
    }
    return vat;
  }

  /**
   * Update the current cluster configuration
   *
   * @param config - The new cluster configuration
   */
  set clusterConfig(config: ClusterConfig) {
    isClusterConfig(config) || Fail`invalid cluster config`;
    this.#mostRecentSubcluster = config;
  }

  /**
   * Get the current cluster configuration
   *
   * @returns The current cluster configuration
   */
  get clusterConfig(): ClusterConfig | null {
    return this.#mostRecentSubcluster;
  }
}
harden(Kernel);
