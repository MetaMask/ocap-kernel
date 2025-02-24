/*
 * Organization of keys in the key value store:
 *
 * Definitions
 *   NN ::= some decimal integer
 *   CAPDATA ::= capdata encoded structure value
 *   JSON(${xx}) ::= JSON encoding of ${xx}
 *
 *   ${koid} ::= ko${NN}                      // kernel object ID
 *   ${kpid} ::= kp${NN}                      // kernel promise ID
 *   ${kref} ::= ${koid} | ${kpid}            // kernel reference
 *   ${dir} ::= + | -                         // direction (for remote and vat references)
 *   ${roid} ::= ro${dir}${NN}                // remote object ID
 *   ${rpid} ::= rp${dir}${NN}                // remote promise ID
 *   ${rref} ::= ${roid} | ${rpid}            // remote reference
 *   ${void} ::= o${dir}${NN}                 // vat object ID
 *   ${vpid} ::= p${dir}${NN}                 // vat promise ID
 *   ${vref} ::= ${void} | ${vpid}            // vat reference
 *   ${eref} ::= ${vref} | ${rref}            // external reference
 *   ${vatid} ::= v${NN}                      // vat ID
 *   ${remid} ::= r${NN}                      // remote ID
 *   ${endid} ::= ${vatid} | ${remid}         // endpoint ID
 *   ${queueName} ::= run | ${kpid}
 *
 * Queues
 *   queue.${queueName}.head = NN             // queue head index
 *   queue.${queueName}.tail = NN             // queue tail index
 *   queue.${queueName}.${NN} = JSON(CAPDATA) // queue entry #NN
 *
 * Kernel objects
 *   ${koid}.refCount = NN                    // reference count
 *   ${koid}.owner = ${vatid}                 // owner (where the object is)
 *
 * Kernel promises
 *   ${kpid}.refCount = NN                    // reference count
 *   ${kpid}.state = unresolved | fulfilled | rejected  // current state of settlement
 *   ${kpid}.subscribers = JSON([${endid}])   // array of who is waiting for settlement
 *   ${kpid}.decider = ${endid}               // who decides on settlement
 *   ${kpid}.value = JSON(CAPDATA)            // value settled to, if settled
 *
 * C-lists
 *   cle.${endpointId}.${eref} = ${kref}      // ERef->KRef mapping
 *   clk.${endpointId}.${kref} = ${eref}      // KRef->ERef mapping
 *
 * Vat bookkeeping
 *   e.nextObjectId.${endid} = NN             // allocation counter for imported object ERefs
 *   e.nextPromiseId.${endid} = NN            // allocation counter for imported promise ERefs
 *
 * Kernel bookkeeping
 *   nextVatId = NN                           // allocation counter for vat IDs
 *   nextRemoteId = NN                        // allocation counter for remote IDs
 *   k.nextObjectId = NN                      // allocation counter for object KRefs
 *   k.nextPromiseId = NN                     // allocation counter for promise KRefs
 */

import type { Message } from '@agoric/swingset-liveslots';
import { Fail } from '@endo/errors';
import type { CapData } from '@endo/marshal';
import type { KVStore, VatStore, KernelDatabase } from '@ocap/store';

import { insistKernelType, makeKernelSlot } from './kernel-slots.ts';
import { parseRef } from './parse-ref.ts';
import {
  buildReachableAndVatSlot,
  parseReachableAndVatSlot,
} from './reachable.ts';
import type {
  VatId,
  RemoteId,
  EndpointId,
  KRef,
  ERef,
  RunQueueItem,
  PromiseState,
  KernelPromise,
  GCAction,
  RunQueueItemBringOutYourDead,
} from '../types.ts';
import { insistGCActionType, insistVatId, RunQueueItemType } from '../types.ts';

type StoredValue = {
  get(): string | undefined;
  set(newValue: string): void;
  delete(): void;
};

type StoredQueue = {
  enqueue(item: object): void;
  dequeue(): object | undefined;
  delete(): void;
};

/**
 * Test if a KRef designates a promise.
 *
 * @param kref - The KRef to test.
 *
 * @returns true iff the given KRef references a promise.
 */
export function isPromiseRef(kref: KRef): boolean {
  return kref[1] === 'p';
}

/**
 * Create a new KernelStore object wrapped around a raw kernel database. The
 * resulting object provides a variety of operations for accessing various
 * kernel-relevent persistent data structure abstractions on their own terms,
 * without burdening the kernel with the particular details of how they are
 * represented in storage.  It is our hope that these operations may be later
 * reimplemented on top of a more sophisticated database layer that can realize
 * them more directly (and thus, one hopes, more efficiently) without requiring
 * the kernel itself to be any the wiser.
 *
 * @param kdb - The kernel database this store is based on.
 * @returns A KernelStore object that maps various persistent kernel data
 * structures onto `kdb`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeKernelStore(kdb: KernelDatabase) {
  // Initialize core state

  /** KV store in which all the kernel's own state is kept. */
  const kv: KVStore = kdb.kernelKVStore;

  /** The kernel's run queue. */
  let runQueue = createStoredQueue('run', true);
  /** Counter for allocating VatIDs */
  let nextVatId = provideCachedStoredValue('nextVatId', '1');
  /** Counter for allocating RemoteIDs */
  let nextRemoteId = provideCachedStoredValue('nextRemoteId', '1');
  /** Counter for allocating kernel object IDs */
  let nextObjectId = provideCachedStoredValue('nextObjectId', '1');
  /** Counter for allocating kernel promise IDs */
  let nextPromiseId = provideCachedStoredValue('nextPromiseId', '1');
  /** Actions to perform during garbage collection */
  let gcActions = provideCachedStoredValue('gcActions', '[]');
  /** Objects to reap */
  let reapQueue = provideCachedStoredValue('reapQueue', '[]');

  // As refcounts are decremented, we accumulate a set of krefs for which
  // action might need to be taken:
  //   * promises which are now resolved and unreferenced can be deleted
  //   * objects which are no longer reachable: export can be dropped
  //   * objects which are no longer recognizable: export can be retired
  // This set is ephemeral: it lives in RAM, grows as deliveries and syscalls
  // cause decrefs, and will be harvested by processRefcounts(). This needs to be
  // called in the same transaction window as the syscalls/etc which prompted
  // the change, else removals might be lost (not performed during the next
  // replay).
  const maybeFreeKrefs = new Set();

  /**
   * Provide a stored value object for which we keep an in-memory cache. We only
   * touch persistent storage if the value hasn't ever been read of if it is
   * modified; otherwise we can service read requests from memory.
   *
   * IMPORTANT NOTE: in order for the cache to work, all subsequent accesses to
   * the value MUST be made through a common stored value object.
   *
   * @param key - A key string that identifies the value.
   * @param init - If provided, an initial setting if the stored entity does not exist.
   * @returns An object for interacting with the value.
   */
  function provideCachedStoredValue(key: string, init?: string): StoredValue {
    let value: string | undefined = kv.get(key);
    if (value === undefined && init !== undefined) {
      kv.set(key, init);
      value = init;
    }
    return harden({
      get(): string | undefined {
        return value;
      },
      set(newValue: string): void {
        value = newValue;
        kv.set(key, value);
      },
      delete(): void {
        value = undefined;
        kv.delete(key);
      },
    });
  }

  /**
   * Provide a stored value object that is kept in persistent storage without caching.
   *
   * @param key - A key string that identifies the value.
   * @param init - If provided, an initial setting if the stored entity does not exist.
   * @returns An object for interacting with the value.
   */
  function provideRawStoredValue(key: string, init?: string): StoredValue {
    if (kv.get(key) === undefined && init !== undefined) {
      kv.set(key, init);
    }
    return harden({
      get: () => kv.get(key),
      set: (newValue: string) => kv.set(key, newValue),
      delete: () => kv.delete(key),
    });
  }

  /**
   * Increment the value of a persistently stored counter.
   *
   * Note that the while the value is interpreted as an integer (in order to
   * enable it to be incremented), it is stored and returned in the form of a
   * string. This is because (a) our persistent storage only stores strings, and
   * (b) the sole purpose of one of these counters is simply to provide an
   * unending sequence of unique values; we don't actually use them as numbers
   * or, indeed, even care at all if this sequence is produced using numbers.
   *
   * @param value - Reference to the stored value to be incremented.
   * @returns The value as it was prior to being incremented.
   */
  function incCounter(value: StoredValue): string {
    const current = value.get();
    const next = `${Number(current) + 1}`;
    value.set(next);
    return current as string;
  }

  /**
   * Create a new (empty) persistently stored queue.
   *
   * @param queueName - The name for the queue (must be unique among queues).
   * @param cached - Optional flag: set to true if the queue should cache its
   * @returns An object for interacting with the new queue.
   */
  function createStoredQueue(
    queueName: string,
    cached: boolean = false,
  ): StoredQueue {
    const qk = `queue.${queueName}`;
    kv.set(`${qk}.head`, '1');
    kv.set(`${qk}.tail`, '1');
    return provideStoredQueue(queueName, cached);
  }

  /**
   * Find out how long some queue is.
   *
   * @param queueName - The name of the queue of interest.
   *
   * @returns the number of items in the given queue.
   */
  function getQueueLength(queueName: string): number {
    const qk = `queue.${queueName}`;
    const head = kv.get(`${qk}.head`);
    const tail = kv.get(`${qk}.tail`);
    if (head === undefined || tail === undefined) {
      throw Error(`unknown queue ${queueName}`);
    }
    return Number(head) - Number(tail);
  }

  /**
   * Produce an object to access a persistently stored queue.
   *
   * @param queueName - The name for the queue (must be unique among queues).
   * @param cached - Optional flag: set to true if the queue should cache its
   * limit indices in memory (only do this if the queue is going to be accessed or
   * checked frequently).
   * @returns An object for interacting with the queue.
   */
  function provideStoredQueue(
    queueName: string,
    cached: boolean = false,
  ): StoredQueue {
    const qk = `queue.${queueName}`;
    // Note: cached=true ==> caches only the head & tail indices, NOT the queue entries themselves
    const provideValue = cached
      ? provideCachedStoredValue
      : provideRawStoredValue;
    const head = provideValue(`${qk}.head`);
    const tail = provideValue(`${qk}.tail`);
    if (head.get() === undefined || tail.get() === undefined) {
      throw Error(`queue ${queueName} not initialized`);
    }
    return {
      enqueue(item: object): void {
        if (head.get() === undefined) {
          throw Error(`enqueue into deleted queue ${queueName}`);
        }
        const entryPos = incCounter(head);
        kv.set(`${qk}.${entryPos}`, JSON.stringify(item));
      },
      dequeue(): object | undefined {
        const headPos = head.get();
        if (headPos === undefined) {
          return undefined;
        }
        const tailPos = tail.get();
        if (tailPos !== headPos) {
          const entry = kv.getRequired(`${qk}.${tailPos}`);
          kv.delete(`${qk}.${tailPos}`);
          incCounter(tail);
          return JSON.parse(entry) as object;
        }
        return undefined;
      },
      delete(): void {
        const headPos = head.get();
        if (headPos !== undefined) {
          let tailPos = tail.get();
          while (tailPos !== headPos) {
            kv.delete(`${qk}.${tailPos}`);
            tailPos = `${Number(tailPos) + 1}`;
          }
          head.delete();
          tail.delete();
        }
      },
    };
  }

  /**
   * Append a message to the kernel's run queue.
   *
   * @param message - The message to enqueue.
   */
  function enqueueRun(message: RunQueueItem): void {
    runQueue.enqueue(message);
  }

  /**
   * Fetch the next message on the kernel's run queue.
   *
   * @returns The next message on the run queue, or undefined if the queue is
   * empty.
   */
  function dequeueRun(): RunQueueItem | undefined {
    return runQueue.dequeue() as RunQueueItem | undefined;
  }

  /**
   * Obtain the number of entries in the run queue.
   *
   * @returns the number of items in the run queue.
   */
  function runQueueLength(): number {
    return getQueueLength('run');
  }

  /**
   * Obtain an ID for a new vat.
   *
   * @returns The next VatID use.
   */
  function getNextVatId(): VatId {
    return `v${incCounter(nextVatId)}`;
  }

  /**
   * Obtain an ID for a new remote connection.
   *
   * @returns The next remote ID use.
   */
  function getNextRemoteId(): RemoteId {
    return `r${incCounter(nextRemoteId)}`;
  }

  /**
   * Initialize persistent state for a new endpoint.
   *
   * @param endpointId - The ID of the endpoint being added.
   */
  function initEndpoint(endpointId: EndpointId): void {
    kv.set(`e.nextPromiseId.${endpointId}`, '1');
    kv.set(`e.nextObjectId.${endpointId}`, '1');
  }

  /**
   * Generate a new eref for a kernel object or promise being imported into an
   * endpoint.
   *
   * @param endpointId - The endpoint the kref is being imported into.
   * @param kref - The kref for the kernel object or promise in question.
   *
   * @returns A new eref in the scope of the given endpoint for the given kernel entity.
   */
  function allocateErefForKref(endpointId: EndpointId, kref: KRef): ERef {
    let id;
    const refTag = endpointId.startsWith('v') ? '' : endpointId[0];
    let refType;
    if (isPromiseRef(kref)) {
      id = kv.get(`e.nextPromiseId.${endpointId}`);
      kv.set(`e.nextPromiseId.${endpointId}`, `${Number(id) + 1}`);
      refType = 'p';
    } else {
      id = kv.get(`e.nextObjectId.${endpointId}`);
      kv.set(`e.nextObjectId.${endpointId}`, `${Number(id) + 1}`);
      refType = 'o';
    }
    const eref = `${refTag}${refType}-${id}`;
    addClistEntry(endpointId, kref, eref);
    return eref;
  }

  /**
   * Obtain a KRef for the next unallocated kernel object.
   *
   * @returns The next koId use.
   */
  function getNextObjectId(): KRef {
    return makeKernelSlot('object', incCounter(nextObjectId));
  }

  /**
   * Generate the storage key for a kernel entity's reference count.
   *
   * @param kref - The KRef of interest.
   * @returns the key to store the indicated reference count at.
   */
  function refCountKey(kref: KRef): string {
    return `${kref}.refCount`;
  }

  /**
   * Get a kernel entity's reference count.
   *
   * @param kref - The KRef of interest.
   * @returns the reference count of the indicated kernel entity.
   */
  function getRefCount(kref: KRef): number {
    return Number(kv.get(refCountKey(kref)));
  }

  /**
   * Increment a kernel entity's reference count.
   *
   * @param kref - The KRef of the entity to increment the ref count of.
   * @returns the new reference count after incrementing.
   */
  function incRefCount(kref: KRef): number {
    const key = refCountKey(kref);
    const newCount = Number(kv.get(key)) + 1;
    kv.set(key, `${newCount}`);
    return newCount;
  }

  /**
   * Decrement a kernel entity's reference count.
   *
   * @param kref - The KRef of the entity to decrement the ref count of.
   * @returns the new reference count after decrementing.
   */
  function decRefCount(kref: KRef): number {
    const key = refCountKey(kref);
    const newCount = Number(kv.get(key)) - 1;
    kv.set(key, `${newCount}`);
    return newCount;
  }

  /**
   * Get the reference counts for a kernel object
   *
   * @param kref - The KRef of the object of interest.
   * @returns The reference counts for the object.
   */
  function getObjectRefCount(kref: KRef): {
    reachable: number;
    recognizable: number;
  } {
    const data = kv.get(refCountKey(kref));
    if (!data) {
      return { reachable: 0, recognizable: 0 };
    }
    const [reachable = 0, recognizable = 0] = data.split(',').map(Number);
    reachable <= recognizable ||
      Fail`refMismatch(get) ${kref} ${reachable},${recognizable}`;
    return { reachable, recognizable };
  }

  /**
   * Set the reference counts for a kernel object
   *
   * @param kref - The KRef of the object of interest.
   * @param counts - The reference counts to set.
   * @param counts.reachable - The reachable reference count.
   * @param counts.recognizable - The recognizable reference count.
   */
  function setObjectRefCount(
    kref: KRef,
    counts: { reachable: number; recognizable: number },
  ): void {
    const { reachable, recognizable } = counts;
    assert.typeof(reachable, 'number');
    assert.typeof(recognizable, 'number');
    (reachable >= 0 && recognizable >= 0) ||
      Fail`${kref} underflow ${reachable},${recognizable}`;
    reachable <= recognizable ||
      Fail`refMismatch(set) ${kref} ${reachable},${recognizable}`;
    kv.set(refCountKey(kref), `${reachable},${recognizable}`);
  }

  /**
   * Create a new kernel object.  The new object will be born with reference and
   * recognizability counts of 1, on the assumption that the new object
   * corresponds to an object that has just been imported from somewhere.
   *
   * @param owner - The endpoint that is the owner of the new object.
   * @returns The new object's KRef.
   */
  function initKernelObject(owner: EndpointId): KRef {
    const koId = getNextObjectId();
    kv.set(`${koId}.owner`, owner);
    setObjectRefCount(koId, { reachable: 1, recognizable: 1 });
    return koId;
  }

  /**
   * Get a kernel object's owner.
   *
   * @param koId - The KRef of the kernel object of interest.
   * @returns The identity of the vat or remote that owns the object.
   */
  function getOwner(koId: KRef): EndpointId {
    const owner = kv.get(`${koId}.owner`);
    if (owner === undefined) {
      throw Error(`unknown kernel object ${koId}`);
    }
    return owner;
  }

  /**
   * Expunge a kernel object from the kernel's persistent state.
   *
   * @param koId - The KRef of the kernel object to delete.
   */
  function deleteKernelObject(koId: KRef): void {
    kv.delete(`${koId}.owner`);
    kv.delete(refCountKey(koId));
  }

  /**
   * Obtain a KRef for the next unallocated kernel promise.
   *
   * @returns The next kpid use.
   */
  function getNextPromiseId(): KRef {
    return makeKernelSlot('promise', incCounter(nextPromiseId));
  }

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
    createStoredQueue(kpid, false);
    kv.set(`${kpid}.state`, 'unresolved');
    kv.set(`${kpid}.subscribers`, '[]');
    kv.set(refCountKey(kpid), '1');
    return [kpid, kpr];
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
    const queue = provideStoredQueue(kpid, false);
    for (const message of getKernelPromiseMessageQueue(kpid)) {
      queue.enqueue(message);
    }
    kv.set(`${kpid}.state`, rejected ? 'rejected' : 'fulfilled');
    kv.set(`${kpid}.value`, JSON.stringify(value));
    kv.delete(`${kpid}.decider`);
    kv.delete(`${kpid}.subscribers`);
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
    kv.delete(refCountKey(kpid));
    provideStoredQueue(kpid).delete();
  }

  /**
   * Get the key for the reachable flag and vatSlot for a given endpoint and kref.
   *
   * @param endpointId - The endpoint for which the reachable flag is being set.
   * @param kref - The kref.
   * @returns The key for the reachable flag and vatSlot.
   */
  function getSlotKey(endpointId: EndpointId, kref: KRef): string {
    return `${endpointId}.c.${kref}`;
  }

  /**
   * Look up the ERef that and endpoint's c-list maps a KRef to.
   *
   * @param endpointId - The endpoint in question.
   * @param eref - The ERef to look up.
   * @returns The KRef corresponding to `eref` in the given endpoints c-list, or undefined
   * if there is no such mapping.
   */
  function erefToKref(endpointId: EndpointId, eref: ERef): KRef | undefined {
    return kv.get(getSlotKey(endpointId, eref));
  }

  /**
   * Look up the KRef that and endpoint's c-list maps an ERef to.
   *
   * @param endpointId - The endpoint in question.
   * @param kref - The KRef to look up.
   * @returns The given endpoint's ERef corresponding to `kref`, or undefined if
   * there is no such mapping.
   */
  function krefToEref(endpointId: EndpointId, kref: KRef): ERef | undefined {
    const key = getSlotKey(endpointId, kref);
    const data = kv.get(key);
    if (!data) {
      return undefined;
    }
    const { vatSlot } = parseReachableAndVatSlot(data);
    return vatSlot;
  }

  /**
   * Remove an entry from an endpoint's c-list given an eref.
   *
   * @param endpointId - The endpoint whose c-list entry is to be removed.
   * @param eref - The ERef.
   */
  function forgetEref(endpointId: EndpointId, eref: ERef): void {
    const kref = erefToKref(endpointId, eref);
    if (kref) {
      deleteClistEntry(endpointId, kref, eref);
    }
  }

  /**
   * Remove an entry from an endpoint's c-list given a kref.
   *
   * @param endpointId - The endpoint whose c-list entry is to be removed.
   * @param kref - The Kref.
   */
  function forgetKref(endpointId: EndpointId, kref: KRef): void {
    const eref = krefToEref(endpointId, kref);
    if (eref) {
      deleteClistEntry(endpointId, kref, eref);
    }
  }

  /**
   * Delete everything from the database.
   */
  function clear(): void {
    kdb.clear();
  }

  /**
   * Create a new VatStore for a vat.
   *
   * @param vatID - The vat for which this is being done.
   *
   * @returns a a VatStore object for the given vat.
   */
  function makeVatStore(vatID: string): VatStore {
    return kdb.makeVatStore(vatID);
  }

  /**
   * Reset the kernel's persistent queues and counters.
   */
  function reset(): void {
    kdb.clear();
    runQueue = createStoredQueue('run', true);
    nextVatId = provideCachedStoredValue('nextVatId', '1');
    nextRemoteId = provideCachedStoredValue('nextRemoteId', '1');
    nextObjectId = provideCachedStoredValue('nextObjectId', '1');
    nextPromiseId = provideCachedStoredValue('nextPromiseId', '1');
    gcActions = provideCachedStoredValue('gcActions', '[]');
    reapQueue = provideCachedStoredValue('reapQueue', '[]');
  }

  /**
   * Check if a kernel object exists in the kernel's persistent state.
   *
   * @param kref - The KRef of the kernel object in question.
   * @returns True if the kernel object exists, false otherwise.
   */
  function kernelObjectExists(kref: KRef): boolean {
    return Boolean(kv.get(refCountKey(kref)));
  }

  /**
   * Check if a kernel object is reachable.
   *
   * @param endpointId - The endpoint for which the reachable flag is being checked.
   * @param kref - The kref.
   * @returns True if the kernel object is reachable, false otherwise.
   */
  function getReachableFlag(endpointId: EndpointId, kref: KRef): boolean {
    const key = getSlotKey(endpointId, kref);
    const data = kv.getRequired(key);
    const { isReachable } = parseReachableAndVatSlot(data);
    return isReachable;
  }

  /**
   * Clear the reachable flag for a given endpoint and kref.
   *
   * @param endpointId - The endpoint for which the reachable flag is being cleared.
   * @param kref - The kref.
   */
  function clearReachableFlag(endpointId: EndpointId, kref: KRef): void {
    const key = getSlotKey(endpointId, kref);
    const { isReachable, vatSlot } = parseReachableAndVatSlot(
      kv.getRequired(key),
    );
    kv.set(key, buildReachableAndVatSlot(false, vatSlot));
    const { direction, isPromise } = parseRef(vatSlot);
    // decrement 'reachable' part of refcount, but only for object imports
    if (
      isReachable &&
      !isPromise &&
      direction === 'import' &&
      kernelObjectExists(kref)
    ) {
      const counts = getObjectRefCount(kref);
      counts.reachable -= 1;
      setObjectRefCount(kref, counts);
      if (counts.reachable === 0) {
        maybeFreeKrefs.add(kref);
      }
    }
  }

  /**
   * Increment the reference count associated with some kernel object.
   *
   * We track references to promises and objects, but not devices. Promises
   * have only a "reachable" count, whereas objects track both "reachable"
   * and "recognizable" counts.
   *
   * @param kref - The kernel slot whose refcount is to be incremented.
   * @param options - Options for the increment.
   * @param options.isExport - True if the reference comes from a clist export, which counts for promises but not objects.
   * @param options.onlyRecognizable - True if the reference provides only recognition, not reachability.
   */
  function incrementRefCount(
    kref: KRef,
    {
      isExport = false,
      onlyRecognizable = false,
    }: { isExport?: boolean; onlyRecognizable?: boolean },
  ): void {
    kref || Fail`incrementRefCount called with empty kref`;

    const { isPromise } = parseRef(kref);
    if (isPromise) {
      const refCount = Number(kv.get(refCountKey(kref))) + 1;
      kv.set(refCountKey(kref), `${refCount}`);
      return;
    }

    // If `isExport` the reference comes from a clist export, which counts for promises but not objects
    if (isExport) {
      return;
    }

    const counts = getObjectRefCount(kref);
    if (!onlyRecognizable) {
      counts.reachable += 1;
    }
    counts.recognizable += 1;
    setObjectRefCount(kref, counts);
  }

  /**
   * Decrement the reference count associated with some kernel object.
   *
   * @param kref - The kernel slot whose refcount is to be decremented.
   * @param options - Options for the decrement.
   * @param options.isExport - True if the reference comes from a clist export, which counts for promises but not objects.
   * @param options.onlyRecognizable - True if the reference provides only recognition, not reachability.
   * @returns True if the reference count has been decremented to zero, false if it is still non-zero.
   * @throws if this tries to decrement the reference count below zero.
   */
  function decrementRefCount(
    kref: KRef,
    {
      isExport = false,
      onlyRecognizable = false,
    }: { isExport?: boolean; onlyRecognizable?: boolean },
  ): boolean {
    kref || Fail`decrementRefCount called with empty kref`;

    const { isPromise } = parseRef(kref);
    if (isPromise) {
      let refCount = Number(kv.get(refCountKey(kref)));
      refCount > 0 || Fail`refCount underflow ${kref}`;
      refCount -= 1;
      kv.set(refCountKey(kref), `${refCount}`);
      if (refCount === 0) {
        maybeFreeKrefs.add(kref);
        return true;
      }
      return false;
    }

    if (isExport || !kernelObjectExists(kref)) {
      return false;
    }

    const counts = getObjectRefCount(kref);
    if (!onlyRecognizable) {
      counts.reachable -= 1;
    }
    counts.recognizable -= 1;
    if (!counts.reachable || !counts.recognizable) {
      maybeFreeKrefs.add(kref);
    }
    setObjectRefCount(kref, counts);

    return false;
  }

  /**
   * Add an entry to an endpoint's c-list, creating a new bidirectional mapping
   * between an ERef belonging to the endpoint and a KRef belonging to the
   * kernel.
   *
   * @param endpointId - The endpoint whose c-list is to be added to.
   * @param kref - The KRef.
   * @param eref - The ERef.
   */
  function addClistEntry(endpointId: EndpointId, kref: KRef, eref: ERef): void {
    kv.set(getSlotKey(endpointId, kref), buildReachableAndVatSlot(true, eref));
    kv.set(getSlotKey(endpointId, eref), kref);
  }

  /**
   * Test if there's a c-list entry for some slot.
   *
   * @param endpointId - The endpoint of interest
   * @param slot - The slot of interest
   * @returns true iff this vat has a c-list entry mapping for `slot`.
   */
  function hasCListEntry(endpointId: EndpointId, slot: string): boolean {
    return kv.get(getSlotKey(endpointId, slot)) !== undefined;
  }

  /**
   * Remove an entry from an endpoint's c-list.
   *
   * @param endpointId - The endpoint whose c-list entry is to be removed.
   * @param kref - The KRef.
   * @param eref - The ERef.
   */
  function deleteClistEntry(
    endpointId: EndpointId,
    kref: KRef,
    eref: ERef,
  ): void {
    const kernelKey = getSlotKey(endpointId, kref);
    const vatKey = getSlotKey(endpointId, eref);
    assert(kv.get(kernelKey));
    clearReachableFlag(endpointId, kref);
    const { direction } = parseRef(eref);
    decrementRefCount(kref, {
      isExport: direction === 'export',
      onlyRecognizable: true,
    });
    kv.delete(kernelKey);
    kv.delete(vatKey);
  }

  /**
   * Get the set of GC actions to perform.
   *
   * @returns The set of GC actions to perform.
   */
  function getGCActions(): Set<GCAction> {
    return new Set(JSON.parse(gcActions.get() ?? '[]'));
  }

  /**
   * Set the set of GC actions to perform.
   *
   * @param actions - The set of GC actions to perform.
   */
  function setGCActions(actions: Set<GCAction>): void {
    const a = Array.from(actions);
    a.sort();
    gcActions.set(JSON.stringify(a));
  }

  /**
   * Add a new GC action to the set of GC actions to perform.
   *
   * @param newActions - The new GC action to add.
   */
  function addGCActions(newActions: GCAction[]): void {
    const actions = getGCActions();
    for (const action of newActions) {
      assert.typeof(action, 'string', 'addGCActions given bad action');
      const [vatId, type, kref] = action.split(' ');
      insistVatId(vatId);
      insistGCActionType(type);
      insistKernelType('object', kref);
      actions.add(action);
    }
    setGCActions(actions);
  }

  /**
   * Schedule a vat for reaping.
   *
   * @param vatId - The vat to schedule for reaping.
   */
  function scheduleReap(vatId: VatId): void {
    const queue = JSON.parse(reapQueue.get() ?? '[]');
    if (!queue.includes(vatId)) {
      queue.push(vatId);
      reapQueue.set(JSON.stringify(queue));
    }
  }

  /**
   * Get the next reap action.
   *
   * @returns The next reap action, or undefined if the queue is empty.
   */
  function nextReapAction(): RunQueueItemBringOutYourDead | undefined {
    const queue = JSON.parse(reapQueue.get() ?? '[]');
    if (queue.length > 0) {
      const vatId = queue.shift();
      reapQueue.set(JSON.stringify(queue));
      return harden({ type: RunQueueItemType.bringOutYourDead, vatId });
    }
    return undefined;
  }

  return harden({
    enqueueRun,
    dequeueRun,
    runQueueLength,
    getNextVatId,
    getNextRemoteId,
    initEndpoint,
    getRefCount,
    incRefCount,
    decRefCount,
    getObjectRefCount,
    setObjectRefCount,
    incrementRefCount,
    decrementRefCount,
    initKernelObject,
    kernelObjectExists,
    getReachableFlag,
    clearReachableFlag,
    getOwner,
    deleteKernelObject,
    initKernelPromise,
    getKernelPromise,
    enqueuePromiseMessage,
    setPromiseDecider,
    getKernelPromiseMessageQueue,
    resolveKernelPromise,
    deleteKernelPromise,
    addPromiseSubscriber,
    addClistEntry,
    hasCListEntry,
    deleteClistEntry,
    erefToKref,
    allocateErefForKref,
    krefToEref,
    forgetEref,
    forgetKref,
    clear,
    makeVatStore,
    getGCActions,
    setGCActions,
    addGCActions,
    scheduleReap,
    nextReapAction,
    reset,
    kv,
  });
}

export type KernelStore = ReturnType<typeof makeKernelStore>;
