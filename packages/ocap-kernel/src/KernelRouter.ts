import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';

import { KernelQueue } from './KernelQueue.ts';
import { kser } from './services/kernel-marshal.ts';
import type { KernelStore } from './store/index.ts';
import { extractSingleRef } from './store/utils/extract-ref.ts';
import { parseRef } from './store/utils/parse-ref.ts';
import { isPromiseRef } from './store/utils/promise-ref.ts';
import type {
  VatId,
  KRef,
  RunQueueItem,
  RunQueueItemSend,
  RunQueueItemBringOutYourDead,
  RunQueueItemNotify,
  RunQueueItemGCAction,
} from './types.ts';
import { insistVatId, insistMessage } from './types.ts';
import { assert, Fail } from './utils/assert.ts';
import { VatHandle } from './VatHandle.ts';

type MessageRoute = {
  vatId?: VatId;
  target: KRef;
} | null;

/**
 * The KernelRouter is responsible for routing messages to the correct vat.
 *
 * This class is responsible for routing messages to the correct vat, including
 * sending messages, resolving promises, and dropping imports.
 */
export class KernelRouter {
  /** The kernel's store. */
  readonly #kernelStore: KernelStore;

  /** The kernel's queue. */
  readonly #kernelQueue: KernelQueue;

  /** A function that returns a vat handle for a given vat id. */
  readonly #getVat: (vatId: VatId) => VatHandle;

  /**
   * Construct a new KernelRouter.
   *
   * @param kernelStore - The kernel's store.
   * @param kernelQueue - The kernel's queue.
   * @param getVat - A function that returns a vat handle for a given vat id.
   */
  constructor(
    kernelStore: KernelStore,
    kernelQueue: KernelQueue,
    getVat: (vatId: VatId) => VatHandle,
  ) {
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#getVat = getVat;
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
  async deliver(item: RunQueueItem): Promise<void> {
    switch (item.type) {
      case 'send':
        await this.#deliverSend(item);
        break;
      case 'notify':
        await this.#deliverNotify(item);
        break;
      case 'dropExports':
      case 'retireExports':
      case 'retireImports':
        await this.#deliverGCAction(item);
        break;
      case 'bringOutYourDead':
        await this.#deliverBringOutYourDead(item);
        break;
      default:
        // @ts-expect-error Runtime does not respect "never".
        Fail`unsupported or unknown run queue item type ${item.type}`;
    }
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
        this.#kernelQueue.resolvePromises(undefined, [
          [message.result, true, error],
        ]);
      }
      return null;
    };
    const routeAsSend = (targetObject: KRef): MessageRoute => {
      const vatId = this.#kernelStore.getOwner(targetObject);
      if (!vatId) {
        return routeAsSplat(kser('no vat'));
      }
      return { vatId, target: targetObject };
    };
    const routeAsRequeue = (targetObject: KRef): MessageRoute => {
      return { target: targetObject };
    };

    if (isPromiseRef(target)) {
      const promise = this.#kernelStore.getKernelPromise(target);
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
   * Deliver a 'send' run queue item.
   *
   * @param item - The send item to deliver.
   */
  async #deliverSend(item: RunQueueItemSend): Promise<void> {
    const route = this.#routeMessage(item);

    // Message went splat
    if (!route) {
      this.#kernelStore.decrementRefCount(item.target, 'deliver|splat|target');
      if (item.message.result) {
        this.#kernelStore.decrementRefCount(
          item.message.result,
          'deliver|splat|result',
        );
      }
      for (const slot of item.message.methargs.slots) {
        this.#kernelStore.decrementRefCount(slot, 'deliver|splat|slot');
      }
      console.log(
        `@@@@ message went splat ${item.target}<-${JSON.stringify(item.message)}`,
      );
      return;
    }

    const { vatId, target } = route;
    const { message } = item;
    console.log(
      `@@@@ deliver ${vatId} send ${target}<-${JSON.stringify(message)}`,
    );
    if (vatId) {
      const vat = this.#getVat(vatId);
      if (vat) {
        if (message.result) {
          if (typeof message.result !== 'string') {
            throw TypeError('message result must be a string');
          }
          this.#kernelStore.setPromiseDecider(message.result, vatId);
          this.#kernelStore.decrementRefCount(
            message.result,
            'deliver|send|result',
          );
        }
        const vatTarget = this.#kernelStore.translateRefKtoV(
          vatId,
          target,
          false,
        );
        const vatMessage = this.#kernelStore.translateMessageKtoV(
          vatId,
          message,
        );
        await vat.deliverMessage(vatTarget, vatMessage);
        this.#kernelStore.decrementRefCount(target, 'deliver|send|target');
        for (const slot of message.methargs.slots) {
          this.#kernelStore.decrementRefCount(slot, 'deliver|send|slot');
        }
      } else {
        Fail`no owner for kernel object ${target}`;
      }
    } else {
      this.#kernelStore.enqueuePromiseMessage(target, message);
    }
    console.log(
      `@@@@ done ${vatId} send ${target}<-${JSON.stringify(message)}`,
    );
  }

  /**
   * Deliver a 'notify' run queue item.
   *
   * @param item - The notify item to deliver.
   */
  async #deliverNotify(item: RunQueueItemNotify): Promise<void> {
    const { vatId, kpid } = item;
    insistVatId(vatId);
    const { context, isPromise } = parseRef(kpid);
    assert(
      context === 'kernel' && isPromise,
      `${kpid} is not a kernel promise`,
    );
    console.log(`@@@@ deliver ${vatId} notify ${vatId} ${kpid}`);
    const promise = this.#kernelStore.getKernelPromise(kpid);
    const { state, value } = promise;
    assert(value, `no value for promise ${kpid}`);
    if (state === 'unresolved') {
      Fail`notification on unresolved promise ${kpid}`;
    }
    if (!this.#kernelStore.krefToEref(vatId, kpid)) {
      // no c-list entry, already done
      return;
    }
    const targets = this.#kernelStore.getKpidsToRetire(kpid, value);
    if (targets.length === 0) {
      // no kpids to retire, already done
      return;
    }
    const resolutions: VatOneResolution[] = [];
    for (const toResolve of targets) {
      const tPromise = this.#kernelStore.getKernelPromise(toResolve);
      if (tPromise.state === 'unresolved') {
        Fail`target promise ${toResolve} is unresolved`;
      }
      if (!tPromise.value) {
        throw Fail`target promise ${toResolve} has no value`;
      }
      resolutions.push([
        this.#kernelStore.translateRefKtoV(vatId, toResolve, true),
        false,
        this.#kernelStore.translateCapDataKtoV(vatId, tPromise.value),
      ]);
      // decrement refcount for the promise being notified
      if (toResolve !== kpid) {
        this.#kernelStore.decrementRefCount(toResolve, 'deliver|notify|slot');
      }
    }
    const vat = this.#getVat(vatId);
    await vat.deliverNotify(resolutions);
    // Decrement reference count for processed 'notify' item
    this.#kernelStore.decrementRefCount(kpid, 'deliver|notify');
    console.log(`@@@@ done ${vatId} notify ${vatId} ${kpid}`);
  }

  /**
   * Deliver a Garbage Collection action run queue item.
   *
   * @param item - The dropExports | retireExports | retireImports item to deliver.
   */
  async #deliverGCAction(item: RunQueueItemGCAction): Promise<void> {
    const { type, vatId, krefs } = item;
    console.log(`@@@@ deliver ${vatId} ${type}`, krefs);
    const vat = this.#getVat(vatId);
    const vrefs = this.#kernelStore.krefsToExistingErefs(vatId, krefs);
    const method =
      `deliver${(type[0] as string).toUpperCase()}${type.slice(1)}` as
        | 'deliverDropExports'
        | 'deliverRetireExports'
        | 'deliverRetireImports';
    await vat[method](vrefs);
    console.log(`@@@@ done ${vatId} ${type}`, krefs);
  }

  /**
   * Deliver a 'bringOutYourDead' run queue item.
   *
   * @param item - The bringOutYourDead item to deliver.
   */
  async #deliverBringOutYourDead(
    item: RunQueueItemBringOutYourDead,
  ): Promise<void> {
    const { vatId } = item;
    console.log(`@@@@ deliver ${vatId} bringOutYourDead`);
    const vat = this.#getVat(vatId);
    await vat.deliverBringOutYourDead();
    console.log(`@@@@ done ${vatId} bringOutYourDead`);
  }
}
