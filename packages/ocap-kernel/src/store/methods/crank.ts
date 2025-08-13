import { Fail, q } from '@endo/errors';
import type { KernelDatabase } from '@metamask/kernel-store';
import { delay } from '@metamask/kernel-utils';

import type { StoreContext } from '../types.ts';

/**
 * Get the crank methods.
 *
 * @param ctx - The store context.
 * @param kdb - The kernel database.
 * @returns The crank methods.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getCrankMethods(ctx: StoreContext, kdb: KernelDatabase) {
  /**
   * Start a crank.
   */
  function startCrank(): void {
    !ctx.inCrank || Fail`startCrank while already in a crank`;
    ctx.inCrank = true;
  }

  /**
   * Create a savepoint in the crank.
   *
   * @param name - The savepoint name.
   */
  function createCrankSavepoint(name: string): void {
    ctx.inCrank || Fail`createCrankSavepoint outside of crank`;
    const ordinal = ctx.savepoints.length;
    ctx.savepoints.push(name);
    kdb.createSavepoint(`t${ordinal}`);
  }

  /**
   * Rollback a crank.
   *
   * @param savepoint - The savepoint name.
   */
  function rollbackCrank(savepoint: string): void {
    ctx.inCrank || Fail`rollbackCrank outside of crank`;
    for (const ordinal of ctx.savepoints.keys()) {
      if (ctx.savepoints[ordinal] === savepoint) {
        kdb.rollbackSavepoint(`t${ordinal}`);
        ctx.savepoints.length = ordinal;
        return;
      }
    }
    Fail`no such savepoint as "${q(savepoint)}"`;
  }

  /**
   * End a crank.
   */
  function endCrank(): void {
    ctx.inCrank || Fail`endCrank outside of crank`;
    if (ctx.savepoints.length > 0) {
      kdb.releaseSavepoint('t0');
      ctx.savepoints.length = 0;
    }
    ctx.inCrank = false;
  }

  /**
   * Release all savepoints.
   */
  function releaseAllSavepoints(): void {
    if (ctx.savepoints.length > 0) {
      kdb.releaseSavepoint('t0');
      ctx.savepoints.length = 0;
    }
  }

  /**
   * Wait until the crank is finished.
   *
   * @returns A promise that resolves when the crank is finished.
   */
  async function waitForCrank(): Promise<void> {
    while (ctx.inCrank) {
      await delay(10);
    }
  }

  return {
    startCrank,
    createCrankSavepoint,
    rollbackCrank,
    endCrank,
    releaseAllSavepoints,
    waitForCrank,
  };
}
