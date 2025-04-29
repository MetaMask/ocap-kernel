import { getRefCountMethods } from './refcount.ts';
import type { KRef } from '../../types.ts';
import type { StoreContext } from '../types.ts';

/**
 * Split a comma-separated string into an array.
 *
 * @param str - The string to split.
 * @returns An array of strings.
 */
function commaSplit(str: string = ''): string[] {
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
   * Multiple calls will increment the pin count for the object.
   *
   * @param kref - The KRef of the object to pin.
   */
  function pinObject(kref: KRef): void {
    const pinList = commaSplit(ctx.kv.get('pinnedObjects'));
    pinList.push(kref);
    incrementRefCount(kref, 'pin');
    ctx.kv.set('pinnedObjects', pinList.sort().join(','));
  }

  /**
   * Unpin a kernel object, allowing it to be garbage collected if no other references exist.
   * Each call decrements the pin count for the object. The object is only fully unpinned
   * when all pins are removed.
   *
   * @param kref - The KRef of the object to unpin.
   */
  function unpinObject(kref: KRef): void {
    const pinList = commaSplit(ctx.kv.get('pinnedObjects'));
    if (pinList.includes(kref)) {
      decrementRefCount(kref, 'unpin');
      pinList.splice(pinList.indexOf(kref), 1);
      ctx.kv.set('pinnedObjects', pinList.sort().join(','));
    }
  }

  /**
   * Get all pinned objects.
   *
   * @returns An array of KRefs for all pinned objects.
   */
  function getPinnedObjects(): KRef[] {
    return commaSplit(ctx.kv.get('pinnedObjects'));
  }

  /**
   * Check if an object is pinned.
   *
   * @param kref - The KRef of the object to check.
   * @returns True if the object is pinned, false otherwise.
   */
  function isObjectPinned(kref: KRef): boolean {
    return getPinnedObjects().includes(kref);
  }

  return {
    pinObject,
    unpinObject,
    getPinnedObjects,
    isObjectPinned,
  };
}
