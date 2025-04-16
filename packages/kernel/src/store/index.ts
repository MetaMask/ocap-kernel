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
 *   cle.${endid}.${eref} = ${kref}           // ERef->KRef mapping
 *   clk.${endid}.${kref} = ${eref}           // KRef->ERef mapping
 *
 * Vat bookkeeping
 *   e.nextObjectId.${endid} = NN             // allocation counter for imported object ERefs
 *   e.nextPromiseId.${endid} = NN            // allocation counter for imported promise ERefs
 *   vatConfig.${vatid} = JSON(CONFIG)        // vat's configuration object
 *
 * Kernel bookkeeping
 *   initialized = true                       // if set, indicates the store has been initialized
 *   nextVatId = NN                           // allocation counter for vat IDs
 *   nextRemoteId = NN                        // allocation counter for remote IDs
 *   k.nextObjectId = NN                      // allocation counter for object KRefs
 *   k.nextPromiseId = NN                     // allocation counter for promise KRefs
 */

import type { KernelDatabase, KVStore, VatStore } from '@ocap/store';

import type { KRef, VatId } from '../types.ts';
import { getBaseMethods } from './methods/base.ts';
import { getCListMethods } from './methods/clist.ts';
import { getGCMethods } from './methods/gc.ts';
import { getIdMethods } from './methods/id.ts';
import { getObjectMethods } from './methods/object.ts';
import { getPromiseMethods } from './methods/promise.ts';
import { getQueueMethods } from './methods/queue.ts';
import { getReachableMethods } from './methods/reachable.ts';
import { getRefCountMethods } from './methods/refcount.ts';
import { getTranslators } from './methods/translators.ts';
import { getVatMethods } from './methods/vat.ts';
import type { StoreContext } from './types.ts';

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

  const { provideCachedStoredValue, provideStoredQueue } = getBaseMethods(kv);

  const context: StoreContext = {
    kv,
    /** The kernel's run queue. */
    runQueue: provideStoredQueue('run', true),
    /** Cache of the run queue's current length */
    runQueueLengthCache: -1,
    /** Counter for allocating kernel object IDs */
    nextObjectId: provideCachedStoredValue('nextObjectId', '1'),
    /** Counter for allocating kernel promise IDs */
    nextPromiseId: provideCachedStoredValue('nextPromiseId', '1'),
    /** Counter for allocating VatIDs */
    nextVatId: provideCachedStoredValue('nextVatId', '1'),
    /** Counter for allocating RemoteIDs */
    nextRemoteId: provideCachedStoredValue('nextRemoteId', '1'),
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
    maybeFreeKrefs: new Set<KRef>(),
    // Garbage collection
    gcActions: provideCachedStoredValue('gcActions', '[]'),
    reapQueue: provideCachedStoredValue('reapQueue', '[]'),
    terminatedVats: provideCachedStoredValue('vats.terminated', '[]'),
  };

  const id = getIdMethods(context);
  const refCount = getRefCountMethods(context);
  const object = getObjectMethods(context);
  const promise = getPromiseMethods(context);
  const gc = getGCMethods(context);
  const cList = getCListMethods(context);
  const queue = getQueueMethods(context);
  const vat = getVatMethods(context);
  const reachable = getReachableMethods(context);
  const translators = getTranslators(context);
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
   * Delete all persistent state associated with a vat.
   *
   * @param vatId - The vat whose state is to be deleted.
   */
  function deleteVat(vatId: VatId): void {
    vat.deleteVatConfig(vatId);
    kdb.deleteVatStore(vatId);
  }

  /**
   * Reset the kernel's persistent state and reset all counters.
   */
  function reset(): void {
    kdb.clear();
    context.maybeFreeKrefs.clear();
    context.runQueue = provideStoredQueue('run', true);
    context.gcActions = provideCachedStoredValue('gcActions', '[]');
    context.reapQueue = provideCachedStoredValue('reapQueue', '[]');
    context.terminatedVats = provideCachedStoredValue('vats.terminated', '[]');
    context.nextObjectId = provideCachedStoredValue('nextObjectId', '1');
    context.nextPromiseId = provideCachedStoredValue('nextPromiseId', '1');
    context.nextVatId = provideCachedStoredValue('nextVatId', '1');
    context.nextRemoteId = provideCachedStoredValue('nextRemoteId', '1');
  }

  /**
   * Delete everything from the database.
   */
  function clear(): void {
    kdb.clear();
  }

  return harden({
    ...id,
    ...queue,
    ...refCount,
    ...object,
    ...promise,
    ...gc,
    ...reachable,
    ...cList,
    ...vat,
    ...translators,
    makeVatStore,
    deleteVat,
    clear,
    reset,
    kv,
  });
}

export type KernelStore = ReturnType<typeof makeKernelStore>;
