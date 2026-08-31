import { describe, it, expect, beforeEach, vi } from 'vitest';

import { makeSQLKernelDatabase } from './nodejs.ts';

/**
 * Two invariants the crank layer relies on:
 *
 * - a failed `ROLLBACK TO` discards the whole transaction, so truncating
 *   `ctx.savepoints` to zero still matches the database;
 * - `commitIfNeeded` leaves no transaction behind.
 *
 * Both drivers catch and log an abort that fails while discarding a transaction,
 * so "the whole transaction is discarded" holds only when that abort succeeds.
 * This driver has no `_inTx` flag, reading `db.inTransaction` from SQLite
 * instead, which prevents a wedged flag but does not end an ownerless
 * transaction.
 */

/** Every statement and exec call, in order. */
let issued: string[] = [];
/** SQL that throws when next run. */
let failOnce: Set<string> = new Set();

const makeStatement = (text: string): Record<string, unknown> => ({
  run: () => {
    issued.push(text);
    if (failOnce.delete(text)) {
      throw new Error(`SQLITE_IOERR: ${text}`);
    }
    return undefined;
  },
  get: () => undefined,
  all: () => [],
  pluck: () => undefined,
  iterate: () => [],
});

const mockDb = {
  prepare: vi.fn((text: string) => makeStatement(text)),
  transaction: vi.fn((fn: () => void) => fn),
  exec: vi.fn((text: string) => {
    issued.push(text);
    if (failOnce.delete(text)) {
      throw new Error(`SQLITE_IOERR: ${text}`);
    }
  }),
  inTransaction: false,
  _spStack: [] as string[],
  close: vi.fn(),
};

vi.mock('better-sqlite3', () => ({
  default: vi.fn(function () {
    return mockDb;
  }),
}));
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn() }));
vi.mock('node:os', () => ({ tmpdir: vi.fn(() => '/mock-tmpdir') }));

describe('the nodejs driver after a failure it tolerates', () => {
  beforeEach(() => {
    issued = [];
    failOnce = new Set();
    mockDb.inTransaction = false;
    mockDb._spStack = [];
  });

  it('discards the transaction when the rollback fails and the abort fails too', async () => {
    const kdb = await makeSQLKernelDatabase({});
    // A crank in progress: SAVEPOINT t0, SAVEPOINT t1.
    mockDb.inTransaction = true;
    mockDb._spStack = ['t0', 't1'];
    issued = [];

    // The disk fills. `ROLLBACK TO SAVEPOINT t1` fails, and so does the
    // `ROLLBACK TRANSACTION` meant to discard the transaction instead. The driver
    // logs that second failure and carries on, so SQLite is still in a
    // transaction with t0 and t1 on its stack.
    failOnce.add('ROLLBACK TO SAVEPOINT t1');
    failOnce.add('ROLLBACK TRANSACTION');
    expect(() => kdb.rollbackSavepoint('t1')).toThrow('SQLITE_IOERR');
    expect(mockDb._spStack).toStrictEqual([]);

    // `_spStack` now says "no savepoints, nothing to commit or abort" while
    // SQLite says otherwise. Teardown still runs after the run loop dies --
    // `reset`, a peer incarnation change, a remote message -- and takes a
    // savepoint.
    issued = [];
    kdb.createSavepoint('teardown');
    kdb.releaseSavepoint('teardown');

    // `beginIfNeeded` saw `inTransaction` and skipped BEGIN, so `teardown` was
    // created inside the transaction that was supposed to be gone, and releasing
    // it committed that transaction whole -- the abandoned crank included.
    expect(issued).not.toContain('COMMIT TRANSACTION');
  });

  it('discards the transaction when the commit fails', async () => {
    const kdb = await makeSQLKernelDatabase({});
    mockDb.inTransaction = true;
    mockDb._spStack = ['t0'];
    issued = [];

    // endCrank: RELEASE SAVEPOINT t0 succeeds, the COMMIT it triggers does not.
    failOnce.add('COMMIT TRANSACTION');
    expect(() => kdb.releaseSavepoint('t0')).toThrow('SQLITE_IOERR');

    // A failed COMMIT can leave the transaction open, and `_spStack` was already
    // spliced empty. Nothing here ends it.
    expect(issued).toContain('ROLLBACK TRANSACTION');
  });
});
