import type {
  VatId,
  RemoteId,
  EndpointId,
  KRef,
  ERef,
  Message,
  KernelObject,
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
   * @param key - A key string that identifies the value.
   * @param init - A initial setting if the indicated value is not present.
   * @returns An object for interacting with the value.
   */
  function makeCachedStoredValue(key: string, init: string): StoredValue {
    let value: string | undefined;
    if (kv.get(key) === undefined && init !== undefined) {
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
   * Provide a stored value object that is backed soley by persistent storage.
   *
   * @param key - A key string that identifies the value.
   * @param init - A initial setting if the indicated value is not present.
   * @returns An object for interacting with the value.
   */
  function makeRawStoredValue(key: string, init: string): StoredValue {
    if (kv.get(key) === undefined) {
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
    const next = `{Number(current) + 1}`;
    value.set(next);
    return current as string;
  }

  /**
   * Create a new persistently stored message queue.
   *
   * @param queueName - The name for the new queue (must be unique among queues).
   * @param cached - Optional flag: set to true if the queue should cache its
   * limit indices in memory (only do this if the queue is going to be accessed or
   * checked frequently).
   * @returns An object for interacting with the queue.
   */
  function makeStoredMessageQueue(
    queueName: string,
    cached: boolean = false,
  ): StoredMessageQueue {
    const qk = `queue.${queueName}`;
    // Note: cached==true ==> caches only the head & tail indices, NOT the messages themselves
    const makeValue = cached ? makeCachedStoredValue : makeRawStoredValue;
    const head = makeValue(`${qk}.head`, '1');
    const tail = makeValue(`${qk}.tail`, '1');
    return {
      enqueue(message: Message): void {
        const entryPos = incCounter(head);
        kv.set(`${qk}.${entryPos}`, JSON.stringify(message));
      },
      dequeue(): Message | undefined {
        const headPos = head.get();
        const tailPos = tail.get();
        if (tailPos !== headPos) {
          const entry = kv.get(`{qk}.${tailPos}`);
          kv.delete(`${qk}.${tailPos}`);
          incCounter(tail);
          return JSON.parse(entry) as Message;
        }
        return undefined;
      },
      delete(): void {
        const headPos = head.get();
        let tailPos = tail.get();
        while (tailPos !== headPos) {
          kv.delete(`${qk}.${tailPos}`);
          tailPos = `${Number(tailPos) + 1}`;
        }
        head.delete();
        tail.delete();
      },
    };
  }

  /** The kernel's run queue. */
  const runQueue = makeStoredMessageQueue('run', true);

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
  const nextVatId = makeCachedStoredValue('nextVatId', '1');
  /**
   * Obtain an ID for a new vat.
   *
   * @returns The next VatID use.
   */
  function getNextVatId(): VatId {
    return `v${incCounter(nextVatId)}`;
  }

  /** Counter for allocating RemoteIDs */
  const nextRemoteId = makeCachedStoredValue('nextRemoteId', '1');
  /**
   * Obtain an ID for a new remote connection.
   *
   * @returns The next remote ID use.
   */
  function getNextRemoteId(): RemoteId {
    return `r${incCounter(nextRemoteId)}`;
  }

  /** Counter for allocating kernel object IDs */
  const nextObjectId = makeCachedStoredValue('nextObjectId', '1');
  /**
   * Obtain a KRef for the next unallocated kernel object.
   *
   * @returns The next koid use.
   */
  function getNextObjectId(): KRef {
    return `ko${incCounter(nextObjectId)}`;
  }

  /**
   * Create a new kernel object.  The new object will be born with reference and
   * recognizability counts of 1, on the assumption that the new object
   * corresponds to an object that has just been imported from somewhere.
   *
   * @param owner - The endpoint that is the owner of the new object.
   * @returns A tuple of the new object's KRef and an object describing the new
   * kernel object itself.
   */
  function initKernelObject(owner: EndpointId): [KRef, KernelObject] {
    const kobj = { owner, reachableCount: 1, recognizableCount: 1 };
    const koid = getNextObjectId();
    kv.set(koid, JSON.stringify(kobj));
    return [koid, kobj];
  }

  /**
   * Fetch the descriptive record for a kernel object.
   *
   * @param koid - The KRef of the kernel object of interest.
   * @returns An object describing the requested kernel object.
   */
  function getKernelObject(koid: KRef): KernelObject {
    const raw = kv.get(koid);
    if (raw === undefined) {
      throw Error(`unknown kernel object ${koid}`);
    }
    return JSON.parse(raw) as KernelObject;
  }

  /**
   * Expunge a kernel object from the kernel's persistent state.
   *
   * @param koid - The KRef of the kernel object to delete.
   */
  function deleteKernelObject(koid: KRef): void {
    kv.delete(koid);
  }

  /** Counter for allocating kernel promise IDs */
  const nextPromiseId = makeCachedStoredValue('nextPromiseId', '1');
  /**
   * Obtain a KRef for the next unallocated kernel promise.
   *
   * @returns The next kpid use.
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
   * @returns A tuple of the new promise's KRef and a object describing the
   * new promise itself.
   */
  function initKernelPromise(decider: EndpointId): [KRef, KernelPromise] {
    const kpr: KernelPromise = {
      decider,
      state: 'unresolved',
      referenceCount: 1,
      value: undefined,
    };
    const kpid = getNextPromiseId();
    makeStoredMessageQueue(`${kpid}.q`);
    kv.set(kpid, JSON.stringify(kpr));
    return [kpid, kpr];
  }

  /**
   * Fetch the descriptive record for a kernel promise.
   *
   * @param kpid - The KRef of the kernel promise of interest.
   * @returns An object describing the requested kernel promise.
   */
  function getKernelPromise(kpid: KRef): KernelPromise {
    const raw = kv.get(kpid);
    if (raw === undefined) {
      throw Error(`unknown kernel promise ${kpid}`);
    }
    return JSON.parse(raw) as KernelPromise;
  }

  /**
   * Fetch the messages in a kernel promise's message queue.
   *
   * @param kpid - The KRef of the kernel promise of interest.
   * @returns An array of all the messages in the given promise's message queue.
   */
  function getKernelPromiseMessageQueue(kpid: KRef): Message[] {
    const result: Message[] = [];
    const queue = makeStoredMessageQueue(`${kpid}.q`);
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
   * @param kpid - The KRef of the kernel promise to delete.
   */
  function deleteKernelPromise(kpid: KRef): void {
    kv.delete(kpid);
    const queue = makeStoredMessageQueue(`${kpid}.q`);
    queue.delete();
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
   * Add an entry to a endpoints c-list, creating a new bidirectional mapping
   * between an ERef belonging to the endpoint and a KRef belonging to the
   * kernel.
   *
   * @param endpointId - The endpoint whose c-list is to be updated.
   * @param kref - The KRef.
   * @param eref - The ERef.
   */
  function addClistEntry(endpointId: EndpointId, kref: KRef, eref: ERef): void {
    kv.set(`clk.${endpointId}.${kref}`, eref);
    kv.set(`cle.${endpointId}.${eref}`, kref);
  }

  return harden({
    enqueueRun,
    dequeueRun,
    getNextVatId,
    getNextRemoteId,
    initKernelObject,
    getKernelObject,
    deleteKernelObject,
    initKernelPromise,
    getKernelPromise,
    getKernelPromiseMessageQueue,
    deleteKernelPromise,
    erefToKref,
    krefToEref,
    addClistEntry,
    kv,
  });
}

export type KernelStore = ReturnType<typeof makeKernelStore>;
