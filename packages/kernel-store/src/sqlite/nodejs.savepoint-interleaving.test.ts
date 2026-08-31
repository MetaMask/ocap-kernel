import { describe, it, expect } from 'vitest';

import { makeSQLKernelDatabase } from './nodejs.ts';

/**
 * `KernelQueue.#runLoop` calls releasing its `crank` savepoint "this crank's one
 * commit point", on the grounds that only `delivery` is ever rolled back.
 *
 * `releaseAllSavepoints` releases `t0`, which is the outermost savepoint only if
 * the crank opened the first one. Two production paths open savepoints through
 * `KernelStore.createSavepoint`, which bypasses `ctx.savepoints` and so is
 * invisible to the ordinal numbering: `RemoteHandle.handleRemoteMessage` (held
 * across its `await this.#handleRedeemURLRequest(...)`) and
 * `RemoteManager.#handlePeerIncarnation`. Neither waits for the crank, and the
 * remote message handler is installed in `Kernel.#init` as a bare async callback,
 * so all three orderings below are reachable while the run loop sits in
 * `await deliver(queueItem)`.
 *
 * Real SQLite through the real driver: these are the savepoint semantics, not a
 * mock's idea of them.
 */
describe('a savepoint the crank does not know about', () => {
  it('outside the crank, leaves the crank release with nothing to commit', async () => {
    const kdb = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
    const kv = kdb.kernelKVStore;

    // RemoteHandle.handleRemoteMessage, parked on its await.
    kdb.createSavepoint('receive_r1_7');

    // The run loop wakes: startCrank, then the two crank savepoints.
    kdb.createSavepoint('t0');
    kdb.createSavepoint('t1');
    kv.set('crankWrite', 'durable');

    // endCrank -> releaseAllSavepoints -> releaseSavepoint('t0'). `t0` is not the
    // outermost savepoint, so this releases into the remote's, not to a commit.
    kdb.releaseSavepoint('t0');

    // The remote message then fails, so RemoteHandle rolls its savepoint back.
    kdb.rollbackSavepoint('receive_r1_7');

    // If releasing `crank` were a commit point, the crank would have survived.
    expect(kv.get('crankWrite')).toBe('durable');
    kdb.close();
  });

  it('inside the crank, is destroyed by the delivery rollback behind its owner', async () => {
    const kdb = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
    const kv = kdb.kernelKVStore;

    // startCrank
    kdb.createSavepoint('t0');
    kdb.createSavepoint('t1');

    // A remote message arrives during `await deliver(queueItem)`.
    kdb.createSavepoint('receive_r1_7');
    kv.set('remoteSeq.r1.highestReceivedSeq', '7');

    // The delivery aborts: rollbackCrank('delivery') issues ROLLBACK TO t1, and
    // SQLite cancels every savepoint started after t1 -- including the remote's.
    kdb.rollbackSavepoint('t1');

    // The remote handler, still inside its own try, reaches its release.
    expect(() => kdb.releaseSavepoint('receive_r1_7')).not.toThrow();
    kdb.close();
  });

  it('inside a crank that succeeds, is committed under its owner', async () => {
    const kdb = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
    const kv = kdb.kernelKVStore;

    // startCrank
    kdb.createSavepoint('t0');
    kdb.createSavepoint('t1');

    // A remote message arrives and gets as far as its await, so the seq row it
    // writes "at the end, within the transaction" is not written yet.
    kdb.createSavepoint('receive_r1_7');
    kv.set('remoteHalfDone', 'yes');

    // endCrank releases t0, and with it everything stacked above.
    kdb.releaseSavepoint('t0');

    // The remote handler resumes and tries to commit its own savepoint. Whatever
    // it decides, its half-finished work is already durable -- and it will report
    // failure, leaving the peer to retry an effect that has landed.
    expect(() => kdb.releaseSavepoint('receive_r1_7')).not.toThrow();
    expect(kv.get('remoteHalfDone')).toBe('yes');
    kdb.close();
  });
});
