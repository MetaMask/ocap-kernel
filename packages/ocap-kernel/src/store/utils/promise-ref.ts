import type { KRef } from '../../types.ts';

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
