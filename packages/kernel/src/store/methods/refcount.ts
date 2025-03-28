import type { KRef } from '../../types.ts';
import type { StoreContext } from '../types.ts';

/**
 * Create a refcount store object that provides functionality for managing reference counts.
 *
 * @param ctx - The store context.
 * @returns A refcount store object that maps various persistent kernel data
 * structures onto `kv`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getRefCountMethods(ctx: StoreContext) {
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
    return Number(ctx.kv.get(refCountKey(kref)));
  }

  /**
   * Increment a kernel entity's reference count.
   *
   * @param kref - The KRef of the entity to increment the ref count of.
   * @returns the new reference count after incrementing.
   */
  function incRefCount(kref: KRef): number {
    const key = refCountKey(kref);
    const newCount = Number(ctx.kv.get(key)) + 1;
    ctx.kv.set(key, `${newCount}`);
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
    const newCount = Number(ctx.kv.get(key)) - 1;
    ctx.kv.set(key, `${newCount}`);
    return newCount;
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

  return {
    refCountKey,
    getRefCount,
    incRefCount,
    decRefCount,
    kernelRefExists,
  };
}
