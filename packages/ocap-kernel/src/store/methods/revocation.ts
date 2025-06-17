import { Fail } from '@endo/errors';

import type { KRef } from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { getBaseMethods } from './base.ts';
import { isPromiseRef } from '../utils/promise-ref.ts';

/**
 * Get the methods that provide functionality for managing object revocation.
 *
 * @param ctx - The store context.
 * @returns The revocation methods.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getRevocationMethods = (ctx: StoreContext) => {
  const { getRevokedKey } = getBaseMethods(ctx.kv);

  /**
   * Set the revoked flag for a kernel object.
   *
   * @param koId - The KRef of the kernel object to set the revoked flag for.
   * @param revoked - The value of the revoked flag.
   */
  function setRevoked(koId: KRef, revoked: boolean): void {
    ctx.kv.set(getRevokedKey(koId), revoked ? 'true' : 'false');
  }

  /**
   * Revoke a kernel object. Idempotent. Revoking promises is not supported.
   *
   * @param koId - The KRef of the kernel object to revoke.
   * @throws If the object is a promise or the koId is unknown.
   */
  function revoke(koId: KRef): void {
    if (isPromiseRef(koId)) {
      // Revoking a promise is not supported.
      throw Error(`cannot revoke promise ${koId}`);
    }
    // Throw if the revoked flag does not exist for this object.
    isRevoked(koId, true);
    // Set the revoked flag to true.
    setRevoked(koId, true);
  }

  /**
   * Check if a kernel object has been revoked.
   *
   * @param koId - The KRef of the kernel object of interest.
   * @param throwIfUnknown - Whether to throw an error if the object is unknown.
   * @returns True if the object is revoked, false otherwise.
   * @throws If the object is unknown and `throwIfUnknown` is true.
   */
  function isRevoked(koId: KRef, throwIfUnknown = true): boolean {
    const revoked = ctx.kv.get(getRevokedKey(koId));
    switch (revoked) {
      case 'true':
        return true;
      case 'false':
        return false;
      case undefined:
        return throwIfUnknown
          ? Fail`cannot check revocation status of unknown object ${koId}`
          : false;
      default:
        throw Error(`invalid revoked flag for object ${koId}: ${revoked}`);
    }
  }

  return {
    setRevoked,
    revoke,
    isRevoked,
  };
};
