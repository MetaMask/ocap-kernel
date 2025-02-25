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

import type { KernelDatabase, KVStore, VatStore } from '@ocap/store';

import { makeBaseStore } from './base-store.ts';
import { makeCListStore } from './clist-store.ts';
import { makeGCStore } from './gc-store.ts';
import { makeIdStore } from './id-store.ts';
import { makeObjectStore } from './object-store.ts';
import { makePromiseStore } from './promise-store.ts';
import { makeQueueStore } from './queue-store.ts';
import { makeRefCountStore } from './refcount-store.ts';

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

  const baseStore = makeBaseStore(kv);
  const idStore = makeIdStore(kv, baseStore);
  const queueStore = makeQueueStore(kv, baseStore);
  const refCountStore = makeRefCountStore(kv);
  const objectStore = makeObjectStore(kv, baseStore, refCountStore);
  const promiseStore = makePromiseStore(
    kv,
    baseStore,
    refCountStore,
    queueStore,
  );
  const gcStore = makeGCStore(kv, baseStore, refCountStore, objectStore);
  const cListStore = makeCListStore(
    kv,
    baseStore,
    gcStore,
    objectStore,
    refCountStore,
  );

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
    queueStore.reset();
    objectStore.reset();
    promiseStore.reset();
    gcStore.reset();
    idStore.reset();
  }

  return harden({
    ...idStore,
    ...queueStore,
    ...refCountStore,
    ...objectStore,
    ...promiseStore,
    ...gcStore,
    ...cListStore,
    makeVatStore,
    clear,
    reset,
    kv,
  });
}

export type KernelStore = ReturnType<typeof makeKernelStore>;
