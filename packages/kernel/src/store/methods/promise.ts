import type { Message } from '@agoric/swingset-liveslots';
import { Fail } from '@endo/errors';
import type { CapData } from '@endo/marshal';

import { getBaseMethods } from './base.ts';
import { getCListMethods } from './clist.ts';
import { getQueueMethods } from './queue.ts';
import { getRefCountMethods } from './refcount.ts';
import type {
  KRef,
  KernelPromise,
  PromiseState,
  RunQueueItemSend,
  VatId,
} from '../../types.ts';
import { insistVatId } from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { makeKernelSlot } from '../utils/kernel-slots.ts';
import { parseRef } from '../utils/parse-ref.ts';
import { isPromiseRef } from '../utils/promise-ref.ts';

/**
 * Create a promise store object that provides functionality for managing kernel promises.
 *
 * @param ctx - The store context.
 * @returns A promise store object that maps various persistent kernel data
 * structures onto `kv`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getPromiseMethods(ctx: StoreContext) {
  const { incCounter, provideStoredQueue, getPrefixedKeys } = getBaseMethods(
    ctx.kv,
  );
  const { enqueueRun } = getQueueMethods(ctx);
  const { refCountKey } = getRefCountMethods(ctx);
  const { incrementRefCount } = getCListMethods(ctx);

  /**
   * Create a new, unresolved kernel promise. The new promise will be born with
   * a reference count of 1 on the assumption that the promise has just been
   * imported from somewhere.
   *
   * @returns A tuple of the new promise's KRef and an object describing the
   * new promise itself.
   */
  function initKernelPromise(): [KRef, KernelPromise] {
    const kpr: KernelPromise = {
      state: 'unresolved',
      subscribers: [],
    };
    const kpid = getNextPromiseId();
    provideStoredQueue(kpid, false);
    ctx.kv.set(`${kpid}.state`, 'unresolved');
    ctx.kv.set(`${kpid}.subscribers`, '[]');
    ctx.kv.set(refCountKey(kpid), '1');
    return [kpid, kpr];
  }

  /**
   * Fetch the descriptive record for a kernel promise.
   *
   * @param kpid - The KRef of the kernel promise of interest.
   * @returns An object describing the requested kernel promise.
   */
  function getKernelPromise(kpid: KRef): KernelPromise {
    const { context, isPromise } = parseRef(kpid);
    assert(context === 'kernel' && isPromise);
    const state = ctx.kv.get(`${kpid}.state`) as PromiseState;
    if (state === undefined) {
      throw Error(`unknown kernel promise ${kpid}`);
    }
    const result: KernelPromise = { state };
    switch (state as string) {
      case 'unresolved': {
        const decider = ctx.kv.get(`${kpid}.decider`);
        if (decider !== '' && decider !== undefined) {
          result.decider = decider;
        }
        const subscribers = ctx.kv.getRequired(`${kpid}.subscribers`);
        result.subscribers = JSON.parse(subscribers);
        break;
      }
      case 'fulfilled':
      case 'rejected': {
        result.value = JSON.parse(ctx.kv.getRequired(`${kpid}.value`));
        break;
      }
      default:
        throw Error(`unknown state for ${kpid}: ${state}`);
    }
    return result;
  }

  /**
   * Expunge a kernel promise from the kernel's persistent state.
   *
   * @param kpid - The KRef of the kernel promise to delete.
   */
  function deleteKernelPromise(kpid: KRef): void {
    ctx.kv.delete(`${kpid}.state`);
    ctx.kv.delete(`${kpid}.decider`);
    ctx.kv.delete(`${kpid}.subscribers`);
    ctx.kv.delete(`${kpid}.value`);
    ctx.kv.delete(refCountKey(kpid));
    provideStoredQueue(kpid).delete();
  }

  /**
   * Obtain a KRef for the next unallocated kernel promise.
   *
   * @returns The next kpid use.
   */
  function getNextPromiseId(): KRef {
    return makeKernelSlot('promise', incCounter(ctx.nextPromiseId));
  }

  /**
   * Add a new subscriber to a kernel promise's collection of subscribers.
   *
   * @param vatId - The vat that is subscribing.
   * @param kpid - The KRef of the promise being subscribed to.
   */
  function addPromiseSubscriber(vatId: VatId, kpid: KRef): void {
    insistVatId(vatId);
    const kp = getKernelPromise(kpid);
    kp.state === 'unresolved' ||
      Fail`attempt to add subscriber to resolved promise ${kpid}`;
    const tempSet = new Set(kp.subscribers);
    tempSet.add(vatId);
    const newSubscribers = Array.from(tempSet).sort();
    const key = `${kpid}.subscribers`;
    ctx.kv.set(key, JSON.stringify(newSubscribers));
  }

  /**
   * Assign a kernel promise's decider.
   *
   * @param kpid - The KRef of promise whose decider is being set.
   * @param vatId - The vat which will become the decider.
   */
  function setPromiseDecider(kpid: KRef, vatId: VatId): void {
    insistVatId(vatId);
    if (kpid) {
      ctx.kv.set(`${kpid}.decider`, vatId);
    }
  }

  /**
   * Record the resolution of a kernel promise.
   *
   * @param kpid - The ref of the promise being resolved.
   * @param rejected - True if the promise is being rejected, false if fulfilled.
   * @param value - The value the promise is being fulfilled to or rejected with.
   */
  function resolveKernelPromise(
    kpid: KRef,
    rejected: boolean,
    value: CapData<KRef>,
  ): void {
    let idx = 0;
    for (const dataSlot of value.slots) {
      incrementRefCount(dataSlot, `resolve|${kpid}|s${idx}`);
      idx += 1;
    }

    const queue = provideStoredQueue(kpid, false);
    for (const message of getKernelPromiseMessageQueue(kpid)) {
      const messageItem: RunQueueItemSend = {
        type: 'send',
        target: kpid,
        message,
      };
      enqueueRun(messageItem);
    }
    ctx.kv.set(`${kpid}.state`, rejected ? 'rejected' : 'fulfilled');
    ctx.kv.set(`${kpid}.value`, JSON.stringify(value));
    ctx.kv.delete(`${kpid}.decider`);
    ctx.kv.delete(`${kpid}.subscribers`);
    queue.delete();
  }

  /**
   * Append a message to a promise's message queue.
   *
   * @param kpid - The KRef of the promise to enqueue on.
   * @param message - The message to enqueue.
   */
  function enqueuePromiseMessage(kpid: KRef, message: Message): void {
    provideStoredQueue(kpid, false).enqueue(message);
  }

  /**
   * Fetch the messages in a kernel promise's message queue.
   *
   * @param kpid - The KRef of the kernel promise of interest.
   * @returns An array of all the messages in the given promise's message queue.
   */
  function getKernelPromiseMessageQueue(kpid: KRef): Message[] {
    const result: Message[] = [];
    const queue = provideStoredQueue(kpid, false);
    for (;;) {
      const message = queue.dequeue() as Message;
      if (message) {
        result.push(message);
      } else {
        return result;
      }
    }
  }
  /**
   * Generator that yield the promises decided by a given vat.
   *
   * @param decider - The vat ID of the vat of interest.
   *
   * @yields the kpids of all the promises decided by `decider`.
   */
  function* getPromisesByDecider(decider: VatId): Generator<string> {
    const basePrefix = `cle.${decider}.`;
    for (const key of getPrefixedKeys(`${basePrefix}p`)) {
      const kpid = ctx.kv.getRequired(key);
      const kp = getKernelPromise(kpid);
      if (kp.state === 'unresolved' && kp.decider === decider) {
        yield kpid;
      }
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
  function getKpidsToRetire(origKpid: KRef, origValue: CapData<KRef>): KRef[] {
    const seen = new Set<KRef>();
    const scanPromise = (kpid: KRef, value: CapData<KRef>): void => {
      seen.add(kpid);
      if (value) {
        for (const slot of value.slots) {
          if (isPromiseRef(slot)) {
            if (!seen.has(slot)) {
              const promise = getKernelPromise(slot);
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

  return {
    initKernelPromise,
    getKernelPromise,
    deleteKernelPromise,
    getNextPromiseId,
    addPromiseSubscriber,
    setPromiseDecider,
    resolveKernelPromise,
    enqueuePromiseMessage,
    getKernelPromiseMessageQueue,
    getPromisesByDecider,
    getKpidsToRetire,
  };
}
