import { Fail } from '@endo/errors';

import { getBaseMethods } from './base.ts';
import { ROOT_OBJECT_VREF } from '../../types.ts';
import type { EndpointId, KRef, VatId } from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { makeKernelSlot } from '../utils/kernel-slots.ts';

/**
 * Create an object store object that provides functionality for managing kernel objects.
 *
 * @param ctx - The store context.
 * @returns An object store object that maps various persistent kernel data
 * structures onto `kv`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getObjectMethods(ctx: StoreContext) {
  const { getSlotKey, incCounter, refCountKey, getOwnerKey } = getBaseMethods(
    ctx.kv,
  );

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
    ctx.kv.set(getOwnerKey(koId), owner);
    setObjectRefCount(koId, { reachable: 1, recognizable: 1 });
    return koId;
  }

  /**
   * Get a kernel object's owner.
   *
   * @param koId - The KRef of the kernel object of interest.
   * @param throwIfUnknown - Whether to throw an error if the owner is unknown.
   * @returns The identity of the vat or remote that owns the object.
   */
  function getOwner(koId: KRef, throwIfUnknown = true): EndpointId | undefined {
    const owner = ctx.kv.get(getOwnerKey(koId));
    if (throwIfUnknown && owner === undefined) {
      throw Error(`unknown kernel object ${koId}`);
    }
    return owner;
  }

  /**
   * Get the root object for a vat.
   *
   * @param vatId - The ID of the vat of interest.
   * @returns The root object for the vat.
   */
  function getRootObject(vatId: VatId): KRef | undefined {
    return ctx.kv.get(getSlotKey(vatId, ROOT_OBJECT_VREF));
  }

  /**
   * True if `kref` is the root object for `vatId`.
   *
   * Every vat exports its root as slot `o+0`, which gives a c‑list entry
   *
   * @param kref - The KRef of the object of interest.
   * @param vatId - The ID of the vat of interest.
   * @returns True if `kref` is the root object for `vatId`.
   */
  function isRootObject(kref: KRef, vatId: VatId): boolean {
    return getRootObject(vatId) === kref;
  }

  /**
   * Expunge a kernel object from the kernel's persistent state.
   *
   * @param koId - The KRef of the kernel object to delete.
   */
  function deleteKernelObject(koId: KRef): void {
    ctx.kv.delete(getOwnerKey(koId));
    ctx.kv.delete(refCountKey(koId));
  }

  /**
   * Obtain a KRef for the next unallocated kernel object.
   *
   * @returns The next koId use.
   */
  function getNextObjectId(): KRef {
    return makeKernelSlot('object', incCounter(ctx.nextObjectId));
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
    const data = ctx.kv.get(refCountKey(kref));
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
    ctx.kv.set(refCountKey(kref), `${reachable},${recognizable}`);
  }

  return {
    initKernelObject,
    getOwner,
    getRootObject,
    isRootObject,
    deleteKernelObject,
    getNextObjectId,
    getObjectRefCount,
    setObjectRefCount,
  };
}
