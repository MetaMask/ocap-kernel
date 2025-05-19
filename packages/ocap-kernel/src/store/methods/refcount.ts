import { Fail } from '@endo/errors';

import { getObjectMethods } from './object.ts';
import type { KRef } from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { getBaseMethods } from './base.ts';
import { parseRef } from '../utils/parse-ref.ts';

/**
 * Create a refcount store object that provides functionality for managing reference counts.
 *
 * @param ctx - The store context.
 * @returns A refcount store object that maps various persistent kernel data
 * structures onto `kv`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getRefCountMethods(ctx: StoreContext) {
  const { refCountKey } = getBaseMethods(ctx.kv);
  const { getObjectRefCount, setObjectRefCount } = getObjectMethods(ctx);

  /**
   * Get a promise's reference count.
   *
   * @param kref - The KRef of the promise of interest.
   * @returns the reference count of the indicated promise.
   */
  function getRefCount(kref: KRef): number {
    return Number(ctx.kv.get(refCountKey(kref)));
  }

  /**
   * Check if a kernel object exists in the kernel's persistent state.
   *
   * @param kref - The KRef of the kernel object in question.
   * @returns True if the kernel object exists, false otherwise.
   */
  function kernelRefExists(kref: KRef): boolean {
    return Boolean(ctx.kv.get(refCountKey(kref)));
  }

  /**
   * Increment a promise's reference count.
   *
   * @param kref - The KRef of the promise to increment the ref count of.
   * @returns the new reference count after incrementing.
   */
  function incRefCount(kref: KRef): number {
    const key = refCountKey(kref);
    const newCount = Number(ctx.kv.get(key)) + 1;
    ctx.kv.set(key, `${newCount}`);
    return newCount;
  }

  /**
   * Decrement a promise's reference count.
   *
   * @param kref - The KRef of the promise to decrement the ref count of.
   * @returns the new reference count after decrementing.
   */
  function decRefCount(kref: KRef): number {
    const key = refCountKey(kref);
    const newCount = Number(ctx.kv.get(key)) - 1;
    ctx.kv.set(key, `${newCount}`);
    return newCount;
  }

  /**
   * Increment the reference count associated with some kernel object.
   *
   * We track references to promises and objects, but not devices. Promises
   * have only a "reachable" count, whereas objects track both "reachable"
   * and "recognizable" counts.
   *
   * @param kref - The kernel slot whose refcount is to be incremented.
   * @param tag - The tag of the kernel slot.
   * @param options - Options for the increment.
   * @param options.isExport - True if the reference comes from a clist export, which counts for promises but not objects.
   * @param options.onlyRecognizable - True if the reference provides only recognition, not reachability.
   */
  function incrementRefCount(
    kref: KRef,
    tag: string,
    {
      isExport = false,
      onlyRecognizable = false,
    }: { isExport?: boolean; onlyRecognizable?: boolean } = {},
  ): void {
    kref || Fail`incrementRefCount called with empty kref`;

    const { isPromise } = parseRef(kref);
    if (isPromise) {
      const refCount = Number(ctx.kv.get(refCountKey(kref))) + 1;
      ctx.logger?.debug('++', refCountKey(kref), refCount, tag);
      ctx.kv.set(refCountKey(kref), `${refCount}`);
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
    ctx.logger?.debug('++', refCountKey(kref), JSON.stringify(counts), tag);
    setObjectRefCount(kref, counts);
  }

  /**
   * Decrement the reference count associated with some kernel object.
   *
   * @param kref - The kernel slot whose refcount is to be decremented.
   * @param tag - The tag of the kernel slot.
   * @param options - Options for the decrement.
   * @param options.isExport - True if the reference comes from a clist export, which counts for promises but not objects.
   * @param options.onlyRecognizable - True if the reference provides only recognition, not reachability.
   * @returns True if the reference count has been decremented to zero, false if it is still non-zero.
   * @throws if this tries to decrement the reference count below zero.
   */
  function decrementRefCount(
    kref: KRef,
    tag: string,
    {
      isExport = false,
      onlyRecognizable = false,
    }: { isExport?: boolean; onlyRecognizable?: boolean } = {},
  ): boolean {
    kref || Fail`decrementRefCount called with empty kref`;

    const { isPromise } = parseRef(kref);
    if (isPromise) {
      let refCount = Number(ctx.kv.get(refCountKey(kref)));
      ctx.logger?.debug('--', refCountKey(kref), refCount - 1, tag);
      refCount > 0 || Fail`refCount underflow ${kref}`;
      refCount -= 1;
      ctx.kv.set(refCountKey(kref), `${refCount}`);
      if (refCount === 0) {
        ctx.maybeFreeKrefs.add(kref);
        return true;
      }
      return false;
    }

    if (isExport || !kernelRefExists(kref)) {
      return false;
    }

    const counts = getObjectRefCount(kref);
    if (!onlyRecognizable) {
      counts.reachable -= 1;
    }
    counts.recognizable -= 1;
    if (!counts.reachable || !counts.recognizable) {
      ctx.maybeFreeKrefs.add(kref);
    }
    ctx.logger?.debug('--', refCountKey(kref), JSON.stringify(counts), tag);
    setObjectRefCount(kref, counts);
    return false;
  }

  return {
    getRefCount,
    kernelRefExists,
    incRefCount,
    decRefCount,
    incrementRefCount,
    decrementRefCount,
  };
}
