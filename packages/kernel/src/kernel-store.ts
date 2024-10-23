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
 *   ${void} ::= vo${dir}${NN}                // vat object ID
 *   ${vpid} ::= vp${dir}${NN}                // vat promise ID
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
 * Kernel bookkeeping
 *   nextVatId = NN
 *   nextRemoteId = NN
 *   nextObjectId = NN
 *   nextPromiseId = NN
 */

import type {
  VatId,
  RemoteId,
  EndpointId,
  KRef,
  ERef,
  Message,
  PromiseState,
  KernelPromise,
} from './kernel-types.js';

type StoredValue = {
  get(): string | undefined;
  set(newValue: string): void;
  delete(): void;
};

type StoredMessageQueue = {
  enqueue(message: Message): void;
  dequeue(): Message | undefined;
  delete(): void;
};

export type KVStore = {
  get(key: string): string;
  getRequired(key: string): string;
  set(key: string, value: string): void;
  delete(key: string): void;
};

/**
 * Create a new KernelStore object wrapped around a simple string-to-string
 * key/value store. The resulting object provides a variety of operations for
 * accessing various kernel-relevent persistent data structure abstractions on
 * their own terms, without burdening the kernel with the particular details of
 * how they are stored.  It is our hope that these operations may be later
 * reimplemented on top of a more sophisticated storage layer that can realize
 * them more directly (and thus, one hopes, more efficiently) without requiring
 * the kernel itself to be any the wiser.
 *
 * @param kv - A key/value store to provide the underlying persistence mechanism.
 * @returns A KernelStore object that maps various persistent kernel data
 * structures onto `kv`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeKernelStore(kv: KVStore) {
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
   * Create a new (empty) persistently stored message queue.
   *
   * @param queueName - The name for the queue (must be unique among queues).
   * @param cached - Optional flag: set to true if the queue should cache its
   * @returns An object for interacting with the new queue.
   */
  function createStoredMessageQueue(
    queueName: string,
    cached: boolean = false,
  ): StoredMessageQueue {
    const qk = `queue.${queueName}`;
    kv.set(`${qk}.head`, '1');
    kv.set(`${qk}.tail`, '1');
    return provideStoredMessageQueue(queueName, cached);
  }

  /**
   * Produce an object to access a persistently stored message queue.
   *
   * @param queueName - The name for the queue (must be unique among queues).
   * @param cached - Optional flag: set to true if the queue should cache its
   * limit indices in memory (only do this if the queue is going to be accessed or
   * checked frequently).
   * @returns An object for interacting with the queue.
   */
  function provideStoredMessageQueue(
    queueName: string,
    cached: boolean = false,
  ): StoredMessageQueue {
    const qk = `queue.${queueName}`;
    // Note: cached=true ==> caches only the head & tail indices, NOT the messages themselves
    const provideValue = cached
      ? provideCachedStoredValue
      : provideRawStoredValue;
    const head = provideValue(`${qk}.head`);
    const tail = provideValue(`${qk}.tail`);
    if (head.get() === undefined || tail.get() === undefined) {
      throw Error(`queue ${queueName} not initialized`);
    }
    return {
      enqueue(message: Message): void {
        if (head.get() === undefined) {
          throw Error(`enqueue into deleted queue ${queueName}`);
        }
        const entryPos = incCounter(head);
        kv.set(`${qk}.${entryPos}`, JSON.stringify(message));
      },
      dequeue(): Message | undefined {
        const headPos = head.get();
        if (headPos === undefined) {
          return undefined;
        }
        const tailPos = tail.get();
        if (tailPos !== headPos) {
          const entry = kv.get(`${qk}.${tailPos}`);
          kv.delete(`${qk}.${tailPos}`);
          incCounter(tail);
          return JSON.parse(entry) as Message;
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

  /** The kernel's run queue. */
  const runQueue = createStoredMessageQueue('run', true);

  /**
   * Append a message to the kernel's run queue.
   *
   * @param message - The message to enqueue.
   */
  function enqueueRun(message: Message): void {
    runQueue.enqueue(message);
  }

  /**
   * Fetch the next message on the kernel's run queue.
   *
   * @returns The next message on the run queue, or undefined if the queue is
   * empty.
   */
  function dequeueRun(): Message | undefined {
    return runQueue.dequeue();
  }

  /** Counter for allocating VatIDs */
  const nextVatId = provideCachedStoredValue('nextVatId', '1');
  /**
   * Obtain an ID for a new vat.
   *
   * @returns The next VatID use.
   */
  function getNextVatId(): VatId {
    return `v${incCounter(nextVatId)}`;
  }

  /** Counter for allocating RemoteIDs */
  const nextRemoteId = provideCachedStoredValue('nextRemoteId', '1');
  /**
   * Obtain an ID for a new remote connection.
   *
   * @returns The next remote ID use.
   */
  function getNextRemoteId(): RemoteId {
    return `r${incCounter(nextRemoteId)}`;
  }

  /** Counter for allocating kernel object IDs */
  const nextObjectId = provideCachedStoredValue('nextObjectId', '1');
  /**
   * Obtain a KRef for the next unallocated kernel object.
   *
   * @returns The next koId use.
   */
  function getNextObjectId(): KRef {
    return `ko${incCounter(nextObjectId)}`;
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
    kv.set(refCountKey(koId), '1');
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
    return owner as EndpointId;
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

  /** Counter for allocating kernel promise IDs */
  const nextPromiseId = provideCachedStoredValue('nextPromiseId', '1');
  /**
   * Obtain a KRef for the next unallocated kernel promise.
   *
   * @returns The next kpId use.
   */
  function getNextPromiseId(): KRef {
    return `kp${incCounter(nextPromiseId)}`;
  }

  /**
   * Create a new, unresolved kernel promise. The new promise will be born with
   * a reference count of 1 on the assumption that the promise has just been
   * imported from somewhere.
   *
   * @param decider - The endpoint that is the decider for the new promise.
   * @returns A tuple of the new promise's KRef and an object describing the
   * new promise itself.
   */
  function initKernelPromise(decider: EndpointId): [KRef, KernelPromise] {
    const kpr: KernelPromise = {
      decider,
      state: 'unresolved',
      subscribers: [],
    };
    const kpId = getNextPromiseId();
    createStoredMessageQueue(kpId, false);
    kv.set(`${kpId}.decider`, decider);
    kv.set(`${kpId}.state`, 'unresolved');
    kv.set(`${kpId}.subscribers`, '[]');
    kv.set(refCountKey(kpId), '1');
    return [kpId, kpr];
  }

  /**
   * Append a message to a promise's message queue.
   *
   * @param kpId - The KRef of the promise to enqueue on.
   * @param message - The message to enqueue.
   */
  function enqueuePromiseMessage(kpId: KRef, message: Message): void {
    provideStoredMessageQueue(kpId, false).enqueue(message);
  }

  /**
   * Fetch the descriptive record for a kernel promise.
   *
   * @param kpId - The KRef of the kernel promise of interest.
   * @returns An object describing the requested kernel promise.
   */
  function getKernelPromise(kpId: KRef): KernelPromise {
    const state = kv.get(`${kpId}.state`) as PromiseState;
    if (state === undefined) {
      throw Error(`unknown kernel promise ${kpId}`);
    }
    const result: KernelPromise = { state };
    switch (state as string) {
      case 'unresolved': {
        const decider = kv.get(`${kpId}.decider`);
        if (decider !== '' && decider !== undefined) {
          result.decider = decider as EndpointId;
        }
        result.subscribers = JSON.parse(kv.get(`${kpId}.subscribers`));
        break;
      }
      case 'fulfilled':
      case 'rejected': {
        result.value = JSON.parse(kv.get(`${kpId}.value`));
        break;
      }
      default:
        throw Error(`unknown state for ${kpId}: ${state}`);
    }
    return result;
  }

  /**
   * Fetch the messages in a kernel promise's message queue.
   *
   * @param kpId - The KRef of the kernel promise of interest.
   * @returns An array of all the messages in the given promise's message queue.
   */
  function getKernelPromiseMessageQueue(kpId: KRef): Message[] {
    const result: Message[] = [];
    const queue = provideStoredMessageQueue(kpId, false);
    for (;;) {
      const message = queue.dequeue();
      if (message) {
        result.push(message);
      } else {
        return result;
      }
    }
  }

  /**
   * Expunge a kernel promise from the kernel's persistent state.
   *
   * @param kpId - The KRef of the kernel promise to delete.
   */
  function deleteKernelPromise(kpId: KRef): void {
    kv.delete(`${kpId}.state`);
    kv.delete(`${kpId}.decider`);
    kv.delete(`${kpId}.subscribers`);
    kv.delete(`${kpId}.value`);
    kv.delete(refCountKey(kpId));
    provideStoredMessageQueue(kpId).delete();
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
    return kv.get(`cle.${endpointId}.${eref}`) as KRef;
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
    return kv.get(`clk.${endpointId}.${kref}`) as ERef;
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
    kv.set(`clk.${endpointId}.${kref}`, eref);
    kv.set(`cle.${endpointId}.${eref}`, kref);
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
    kv.delete(`clk.${endpointId}.${kref}`);
    kv.delete(`cle.${endpointId}.${eref}`);
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

  return harden({
    enqueueRun,
    dequeueRun,
    getNextVatId,
    getNextRemoteId,
    getRefCount,
    incRefCount,
    decRefCount,
    initKernelObject,
    getOwner,
    deleteKernelObject,
    initKernelPromise,
    getKernelPromise,
    enqueuePromiseMessage,
    getKernelPromiseMessageQueue,
    deleteKernelPromise,
    erefToKref,
    krefToEref,
    addClistEntry,
    forgetEref,
    forgetKref,
    kv,
  });
}

export type KernelStore = ReturnType<typeof makeKernelStore>;
