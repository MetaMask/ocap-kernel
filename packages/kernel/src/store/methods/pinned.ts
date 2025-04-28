import { getRefCountMethods } from './refcount.ts';
import type { KRef } from '../../types.ts';
import type { StoreContext } from '../types.ts';

/**
 * Split a comma-separated string into an array.
 *
 * @param str - The string to split.
 * @returns An array of strings.
 */
function commaSplit(str: string): string[] {
  return str ? str.split(',') : [];
}

/**
 * Create a pinned store that provides high-level functionality for managing pinned objects.
 *
 * @param ctx - The store context.
 * @returns A pinned store with functions for pinning/unpinning objects and managing pinned objects.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getPinMethods(ctx: StoreContext) {
  const { incrementRefCount, decrementRefCount } = getRefCountMethods(ctx);

  /**
   * Pin a kernel object to prevent it from being garbage collected.
   *
   * @param kref - The KRef of the object to pin.
   */
  function pinObject(kref: KRef): void {
    const pinList = getPinnedObjects();
    const pinned = new Set(pinList);
    if (!pinned.has(kref)) {
      incrementRefCount(kref, 'pin');
      pinned.add(kref);
      ctx.kv.set('pinnedObjects', [...pinned].sort().join(','));
    }
  }

  /**
   * Unpin a kernel object, allowing it to be garbage collected if no other references exist.
   *
   * @param kref - The KRef of the object to unpin.
   */
  function unpinObject(kref: KRef): void {
    const pinList = getPinnedObjects();
    const pinned = new Set(pinList);
    if (pinned.has(kref)) {
      decrementRefCount(kref, 'unpin');
      pinned.delete(kref);
      ctx.kv.set('pinnedObjects', [...pinned].sort().join(','));
    }
  }

  /**
   * Get all pinned objects.
   *
   * @returns An array of KRefs for all pinned objects.
   */
  function getPinnedObjects(): KRef[] {
    const pinList = ctx.kv.get('pinnedObjects') ?? '';
    return commaSplit(pinList);
  }

  /**
   * Check if an object is pinned.
   *
   * @param kref - The KRef of the object to check.
   * @returns True if the object is pinned, false otherwise.
   */
  function isObjectPinned(kref: KRef): boolean {
    const pinned = new Set(getPinnedObjects());
    return pinned.has(kref);
  }

  return {
    pinObject,
    unpinObject,
    getPinnedObjects,
    isObjectPinned,
  };
}
