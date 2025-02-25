import type { Message } from '@agoric/swingset-liveslots';
import { Fail } from '@endo/errors';
import type { CapData } from '@endo/marshal';
import type { KVStore } from '@ocap/store';

import type { makeBaseStore } from './base-store';
import type { makeQueueStore } from './queue-store.ts';
import type { makeRefCountStore } from './refcount-store';
import { makeKernelSlot } from './utils/kernel-slots';
import { parseRef } from './utils/parse-ref';
import type { KRef, KernelPromise, PromiseState, VatId } from '../types.ts';
import { insistVatId } from '../types.ts';

/**
 * Create a promise store object that provides functionality for managing kernel promises.
 *
 * @param kv - The key-value store to use for persistent storage.
 * @param baseStore - The base store to use for the promise store.
 * @param refCountStore - The refcount store to use for the promise store.
 * @param queueStore - The queue store to use for the promise store.
 * @returns A promise store object that maps various persistent kernel data
 * structures onto `kv`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makePromiseStore(
  kv: KVStore,
  baseStore: ReturnType<typeof makeBaseStore>,
  refCountStore: ReturnType<typeof makeRefCountStore>,
  queueStore: ReturnType<typeof makeQueueStore>,
) {
  /** Counter for allocating kernel promise IDs */
  let nextPromiseId = baseStore.provideCachedStoredValue('nextPromiseId', '1');

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
    queueStore.createStoredQueue(kpid, false);
    kv.set(`${kpid}.state`, 'unresolved');
    kv.set(`${kpid}.subscribers`, '[]');
    kv.set(refCountStore.refCountKey(kpid), '1');
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
    const state = kv.get(`${kpid}.state`) as PromiseState;
    if (state === undefined) {
      throw Error(`unknown kernel promise ${kpid}`);
    }
    const result: KernelPromise = { state };
    switch (state as string) {
      case 'unresolved': {
        const decider = kv.get(`${kpid}.decider`);
        if (decider !== '' && decider !== undefined) {
          result.decider = decider;
        }
        const subscribers = kv.getRequired(`${kpid}.subscribers`);
        result.subscribers = JSON.parse(subscribers);
        break;
      }
      case 'fulfilled':
      case 'rejected': {
        result.value = JSON.parse(kv.getRequired(`${kpid}.value`));
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
    kv.delete(`${kpid}.state`);
    kv.delete(`${kpid}.decider`);
    kv.delete(`${kpid}.subscribers`);
    kv.delete(`${kpid}.value`);
    kv.delete(refCountStore.refCountKey(kpid));
    queueStore.provideStoredQueue(kpid).delete();
  }

  /**
   * Obtain a KRef for the next unallocated kernel promise.
   *
   * @returns The next kpid use.
   */
  function getNextPromiseId(): KRef {
    return makeKernelSlot('promise', baseStore.incCounter(nextPromiseId));
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
    kv.set(key, JSON.stringify(newSubscribers));
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
      kv.set(`${kpid}.decider`, vatId);
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
    const queue = queueStore.provideStoredQueue(kpid, false);
    for (const message of getKernelPromiseMessageQueue(kpid)) {
      queue.enqueue(message);
    }
    kv.set(`${kpid}.state`, rejected ? 'rejected' : 'fulfilled');
    kv.set(`${kpid}.value`, JSON.stringify(value));
    kv.delete(`${kpid}.decider`);
    kv.delete(`${kpid}.subscribers`);
  }

  /**
   * Append a message to a promise's message queue.
   *
   * @param kpid - The KRef of the promise to enqueue on.
   * @param message - The message to enqueue.
   */
  function enqueuePromiseMessage(kpid: KRef, message: Message): void {
    queueStore.provideStoredQueue(kpid, false).enqueue(message);
  }

  /**
   * Fetch the messages in a kernel promise's message queue.
   *
   * @param kpid - The KRef of the kernel promise of interest.
   * @returns An array of all the messages in the given promise's message queue.
   */
  function getKernelPromiseMessageQueue(kpid: KRef): Message[] {
    const result: Message[] = [];
    const queue = queueStore.provideStoredQueue(kpid, false);
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
   *
   */
  function reset(): void {
    nextPromiseId = baseStore.provideCachedStoredValue('nextPromiseId', '1');
  }

  return {
    // Promise lifecycle
    initKernelPromise,
    getKernelPromise,
    deleteKernelPromise,
    getNextPromiseId,

    // Promise state management
    addPromiseSubscriber,
    setPromiseDecider,
    resolveKernelPromise,

    // Promise messaging
    enqueuePromiseMessage,
    getKernelPromiseMessageQueue,

    // Reset
    reset,
  };
}
