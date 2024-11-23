import '@ocap/shims/endoify';
import { passStyleOf } from '@endo/far';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import {
  StreamReadError,
  VatAlreadyExistsError,
  VatNotFoundError,
  toError,
} from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';

// XXX Once the packaging of liveslots is fixed, these should be imported from there
import type { Message, VatOneResolution } from './ag-types.js';
import { kser, kunser, krefOf, kslot } from './kernel-marshal.js';
import type { SlotValue } from './kernel-marshal.js';
import {
  isKernelCommand,
  isVatCommandReply,
  KernelCommandMethod,
  VatCommandMethod,
} from './messages/index.js';
import type {
  KernelCommand,
  KernelCommandReply,
  VatCommand,
  VatCommandReply,
  VatCommandReturnType,
} from './messages/index.js';
import type { KernelStore } from './store/kernel-store.js';
import {
  parseRef,
  isPromiseRef,
  makeKernelStore,
} from './store/kernel-store.js';
import type { KVStore } from './store/sqlite-kv-store.js';
import type {
  VatId,
  VRef,
  ERef,
  KRef,
  VatWorkerService,
  ClusterConfig,
  VatConfig,
  RunQueueItem,
  RunQueueItemSend,
  RunQueueItemNotify,
} from './types.js';
import { ROOT_OBJECT_VREF } from './types.js';
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
    return krefOf(value) as KRef;
  }
  return null;
}

type MessageRoute = {
  vatId?: VatId;
  target: KRef;
} | null;

export class Kernel {
  readonly #stream: DuplexStream<KernelCommand, KernelCommandReply>;

  readonly #vats: Map<VatId, VatHandle>;

  readonly #vatWorkerService: VatWorkerService;

  readonly #storage: KernelStore;

  readonly #logger: Logger;

  #runQueueLength: number;

  #wakeUpQueue: (() => void) | null;

  #mostRecentSubcluster: ClusterConfig | null;

  constructor(
    stream: DuplexStream<KernelCommand, KernelCommandReply>,
    vatWorkerService: VatWorkerService,
    rawStorage: KVStore,
    logger?: Logger,
  ) {
    this.#mostRecentSubcluster = null;
    this.#stream = stream;
    this.#vats = new Map();
    this.#vatWorkerService = vatWorkerService;
    rawStorage.clear(); // XXX debug only!
    this.#storage = makeKernelStore(rawStorage);
    this.#logger = logger ?? makeLogger('[ocap kernel]');
    this.#runQueueLength = this.#storage.runQueueLength();
    this.#wakeUpQueue = null;
  }

  async init(): Promise<void> {
    this.#receiveMessages().catch((error) => {
      this.#logger.error('Stream read error occurred:', error);
      // Errors thrown here will not be surfaced in the usual synchronous manner
      // because #receiveMessages() is awaited within the constructor.
      // Any error thrown inside the async loop is 'caught' within this constructor
      // call stack but will be displayed as 'Uncaught (in promise)'
      // since they occur after the constructor has returned.
      throw new StreamReadError({ kernelId: 'kernel' }, error);
    });
    // eslint-disable-next-line no-void
    void this.#run();
  }

  async #run(): Promise<void> {
    for await (const item of this.#runQueueItems()) {
      await this.#deliver(item);
    }
  }

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
        if (this.#wakeUpQueue !== null) {
          throw Error(`wakeUpQueue function already set`);
        }
        this.#wakeUpQueue = resolve;
        await promise;
      }
    }
  }

  async #receiveMessages(): Promise<void> {
    for await (const message of this.#stream) {
      if (!isKernelCommand(message)) {
        this.#logger.error('Received unexpected message', message);
        continue;
      }

      const { method, params } = message;

      let vat: VatHandle;

      switch (method) {
        case KernelCommandMethod.ping:
          await this.#reply({ method, params: 'pong' });
          break;
        case KernelCommandMethod.evaluate:
          if (!this.#vats.size) {
            throw new Error('No vats available to call');
          }
          vat = this.#vats.values().next().value as VatHandle;
          await this.#reply({
            method,
            params: await this.evaluate(vat.vatId, params),
          });
          break;
        case KernelCommandMethod.kvSet:
          this.kvSet(params.key, params.value);
          await this.#reply({
            method,
            params: `~~~ set "${params.key}" to "${params.value}" ~~~`,
          });
          break;
        case KernelCommandMethod.kvGet: {
          try {
            const value = this.kvGet(params);
            const result =
              typeof value === 'string' ? `"${value}"` : `${value}`;
            await this.#reply({
              method,
              params: `~~~ got ${result} ~~~`,
            });
          } catch (problem) {
            // TODO: marshal
            await this.#reply({
              method,
              params: String(toError(problem)),
            });
          }
          break;
        }
        default:
          console.error(
            'kernel worker received unexpected command',
            // @ts-expect-error Runtime does not respect "never".
            { method: method.valueOf(), params },
          );
      }
    }
  }

  async #reply(message: KernelCommandReply): Promise<void> {
    await this.#stream.write(message);
  }

  /**
   * Evaluate a string in the default iframe.
   *
   * @param vatId - The ID of the vat to send the message to.
   * @param source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  async evaluate(vatId: VatId, source: string): Promise<string> {
    try {
      const result = await this.sendMessage(vatId, {
        method: VatCommandMethod.evaluate,
        params: source,
      });
      return String(result);
    } catch (error) {
      if (error instanceof Error) {
        return `Error: ${error.message}`;
      }
      return `Error: Unknown error during evaluation.`;
    }
  }

  kvGet(key: string): string | undefined {
    return this.#storage.kv.get(key);
  }

  kvSet(key: string, value: string): void {
    this.#storage.kv.set(key, value);
  }

  /**
   * Gets the vat IDs.
   *
   * @returns An array of vat IDs.
   */
  getVatIds(): VatId[] {
    return Array.from(this.#vats.keys());
  }

  exportFromVat(vatId: VatId, vref: VRef): KRef {
    const { isPromise } = parseRef(vref);
    const kref = isPromise
      ? this.#storage.initKernelPromise()[0]
      : this.#storage.initKernelObject(vatId);
    this.#storage.addClistEntry(vatId, kref, vref);
    return kref;
  }

  /**
   * Gets the list of all vats.
   *
   * @returns An array of vats.
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

  async #startVat(vatId: VatId, vatConfig: VatConfig): Promise<KRef> {
    if (this.#vats.has(vatId)) {
      throw new VatAlreadyExistsError(vatId);
    }
    const multiplexer = await this.#vatWorkerService.launch(vatId, vatConfig);
    multiplexer.start().catch((error) => this.#logger.error(error));
    const commandStream = multiplexer.createChannel<
      VatCommandReply,
      VatCommand
    >('command', isVatCommandReply);
    const vat = new VatHandle({
      kernel: this,
      vatId,
      vatConfig,
      commandStream,
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
   * @returns A promise for a reference to the new vat's root object
   */
  async launchVat(vatConfig: VatConfig): Promise<KRef> {
    return this.#startVat(this.#storage.getNextVatId(), vatConfig);
  }

  #translateRefKtoE(vatId: VatId, kref: KRef, importIfNeeded: boolean): ERef {
    let eref = this.#storage.krefToEref(vatId, kref);
    if (!eref) {
      if (importIfNeeded) {
        eref = this.#storage.allocateErefForKref(vatId, kref);
      } else {
        throw Error(`unmapped kref ${kref} vat=${vatId}`);
      }
    }
    return eref;
  }

  #translateCapDataKtoE(vatId: VatId, capdata: CapData<KRef>): CapData<ERef> {
    const slots: ERef[] = [];
    for (const slot of capdata.slots) {
      slots.push(this.#translateRefKtoE(vatId, slot, true));
    }
    return { body: capdata.body, slots };
  }

  enqueueRun(item: RunQueueItem): void {
    this.#storage.enqueueRun(item);
    this.#runQueueLength += 1;
    if (this.#runQueueLength === 1 && this.#wakeUpQueue) {
      const wakeUpQueue = this.#wakeUpQueue;
      this.#wakeUpQueue = null;
      wakeUpQueue();
    }
  }

  #dequeueRun(): RunQueueItem | undefined {
    this.#runQueueLength -= 1;
    const result = this.#storage.dequeueRun();
    return result;
  }

  /**
   * Routes a message to its destination based on the target type and state. In
   * the most general case, this route consists of a vatId and a destination
   * object reference.
   *
   * There are three possible outcomes:
   * - splat: message is dropped (with optional error resolution), indicated by
   *   a null return value
   * - send: message is delivered to a specific object in a specific vat
   * - requeue: message is put back on the run queue for later delivery (for
   *   unresolved promises), indicated by absence of a target vat in the return value
   *
   * @param item - The message to route.
   * @returns The route for the message.
   */
  #routeMessage(item: RunQueueItemSend): MessageRoute {
    const { target, message } = item;

    const routeAsSplat = (error?: CapData<KRef>): MessageRoute => {
      if (message.result && error) {
        this.doResolve(undefined, [[message.result, true, error]]);
      }
      return null;
    };
    const routeAsSend = (targetObject: KRef): MessageRoute => {
      const vatId = this.#storage.getOwner(targetObject) as VatId;
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
          // Runtime does not respect "never".
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          throw Error(`unknown promise state ${promise.state}`);
      }
    } else {
      return routeAsSend(target);
    }
  }

  #translateMessageKtoE(vatId: VatId, message: Message): Message {
    const methargs = this.#translateCapDataKtoE(
      vatId,
      message.methargs as CapData<KRef>,
    );
    const result = message.result
      ? this.#translateRefKtoE(vatId, message.result as KRef, true)
      : message.result;
    const vatMessage = { ...message, methargs, result };
    return vatMessage;
  }

  /**
   * Delivers run queue items to their targets.
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
              this.#storage.setPromiseDecider(message.result as KRef, vatId);
              const vatTarget = this.#translateRefKtoE(vatId, target, false);
              const vatMessage = this.#translateMessageKtoE(vatId, message);
              await vat.deliverMessage(vatTarget as VRef, vatMessage);
            } else {
              throw Error(`no owner for kernel object ${target}`);
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
        log(`@@@@ deliver ${vatId} notify ${kpid}`);
        const promise = this.#storage.getKernelPromise(kpid);
        const { state, value } = promise;
        if (!value) {
          throw Error(`no value for promise ${kpid}`);
        }
        if (state === 'unresolved') {
          throw Error(`notifcation on unresolved promise ${kpid}`);
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
            throw Error(`target promise ${toResolve} is unresolved`);
          }
          if (!tPromise.value) {
            throw Error(`target promise ${toResolve} has no value`);
          }
          resolutions.push([
            this.#translateRefKtoE(vatId, toResolve, true),
            false,
            this.#translateCapDataKtoE(vatId, tPromise.value),
          ]);
        }
        const vat = this.#getVat(vatId);
        await vat.deliverNotify(resolutions);
        log(`@@@@ done ${vatId} notify ${kpid}`);
        break;
      }
      default:
        // @ts-expect-error Runtime does not respect "never".
        throw Error(`unsupported or unknown run queue item type ${item.type}`);
    }
  }

  /**
   * Given a promise that has just been resolved and the value it resolved to,
   * find all promises reachable (recursively) from the new resolution value
   * which are themselves resolved. This will determine the set of resolutions
   * that subscribers to the original promise will need to be notified of.
   *
   * This is needed because subscription to a promise carries with it an implied
   * subscription to any promises that appear in its resolution value -- these
   * subscriptions must be implied rather than explicit because they are
   * necessarily unknown at the time of the original promise was subscribed to.
   *
   * @param origKpid - The original promise to start from.
   * @param origValue - The value the original promise is resolved to.
   * @returns An array of the kpids of the promises whose values become visible
   * as a consequence of the resolution of origKpid.
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
  #notify(vatId: VatId, kpid: KRef): void {
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
    for (const resolution of resolutions) {
      const [kpidRaw, rejected, dataRaw] = resolution;
      const kpid = kpidRaw as KRef;
      const data = dataRaw as CapData<KRef>;
      const promise = this.#storage.getKernelPromise(kpid);
      const { state, decider, subscribers } = promise;
      if (state !== 'unresolved') {
        throw Error(`${kpid} was already resolved`);
      }
      if (decider !== vatId) {
        throw Error(`${kpid} is decided by ${decider}, not ${vatId}`);
      }
      if (!subscribers) {
        throw Error(`${kpid} subscribers not set`);
      }
      for (const subscriber of subscribers) {
        this.#notify(subscriber as VatId, kpid);
      }
      this.#storage.resolveKernelPromise(kpid, rejected, data);
    }
  }

  /**
   * Launches a sub-cluster of vats.
   *
   * @param config - Configuration object for sub-cluster.
   * @returns A record of the root objects of the vats launched.
   */
  async launchSubcluster(config: ClusterConfig): Promise<Record<string, KRef>> {
    if (config.bootstrap && !config.vats[config.bootstrap]) {
      throw Error(`invalid bootstrap vat name ${config.bootstrap}`);
    }
    this.#mostRecentSubcluster = config;
    const rootIds: Record<string, KRef> = {};
    const roots: Record<string, SlotValue> = {};
    for (const [vatName, vatConfig] of Object.entries(config.vats)) {
      const rootRef = await this.launchVat(vatConfig);
      rootIds[vatName] = rootRef;
      roots[vatName] = kslot(rootRef, 'vatRoot');
    }
    if (config.bootstrap) {
      const bootstrapRoot = rootIds[config.bootstrap];
      if (bootstrapRoot) {
        const bootstrapMessage: Message = {
          methargs: kser(['bootstrap', [roots]]),
        };
        const bootstrapItem: RunQueueItemSend = {
          type: 'send',
          target: bootstrapRoot,
          message: bootstrapMessage,
        };
        this.enqueueRun(bootstrapItem);
      }
    }
    return rootIds;
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
   * @param id - The ID of the vat.
   */
  async terminateVat(id: VatId): Promise<void> {
    const vat = this.#getVat(id);
    await vat.terminate();
    await this.#vatWorkerService.terminate(id).catch(console.error);
    this.#vats.delete(id);
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

  async reload(): Promise<void> {
    if (this.#mostRecentSubcluster) {
      await this.launchSubcluster(this.#mostRecentSubcluster);
    }
  }

  /**
   * Clear the database.
   */
  async clearStorage(): Promise<void> {
    this.#storage.reset();
  }

  /**
   * Send a message to a vat.
   *
   * @param id - The id of the vat to send the message to.
   * @param command - The command to send.
   * @returns A promise that resolves the response to the message.
   */
  async sendMessage<Method extends VatCommand['payload']['method']>(
    id: VatId,
    command: Extract<VatCommand['payload'], { method: Method }>,
  ): Promise<VatCommandReturnType[Method]> {
    const vat = this.#getVat(id);
    return vat.sendMessage(command);
  }

  /**
   * Resets the kernel state.
   */
  async reset(): Promise<void> {
    await this.terminateAllVats();
    this.#storage.reset();
  }

  /**
   * Gets a vat.
   *
   * @param vatId - The ID of the vat.
   * @returns The vat.
   */
  #getVat(vatId: VatId): VatHandle {
    const vat = this.#vats.get(vatId);
    if (vat === undefined) {
      throw new VatNotFoundError(vatId);
    }
    return vat;
  }
}
harden(Kernel);
