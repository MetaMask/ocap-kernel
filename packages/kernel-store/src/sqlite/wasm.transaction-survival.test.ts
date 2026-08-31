import { describe, it, expect, beforeEach, vi } from 'vitest';

import { makeSQLKernelDatabase } from './wasm.ts';

/**
 * `commitIfNeeded` clears `_inTx` before stepping the COMMIT, so a COMMIT that
 * throws cannot wedge the flag true. That closes one door and opens another:
 * SQLite can fail a COMMIT with the transaction still open, and with `_inTx`
 * already false `rollbackIfNeeded` is a no-op, `commitIfNeeded` will not try
 * again, and `releaseSavepoint` reaches `commitIfNeeded` with nothing wrapping
 * it. The transaction is left with no owner -- the same hazard
 * `rollbackSavepoint` and `releaseSavepoint` discard the transaction to avoid,
 * reached by a third door.
 *
 * The nodejs driver reads `db.inTransaction` from SQLite rather than caching it,
 * so it cannot wedge the flag; see `nodejs.transaction-survival.test.ts` for why
 * that is not the same as having no gap.
 */

/** Every exec call and statement step, in order. */
let issued: string[] = [];
/** SQL that throws when next stepped. */
let failOnce: Set<string> = new Set();

const makeStatement = (text: string): Record<string, unknown> => ({
  bind: () => undefined,
  step: () => {
    issued.push(text);
    if (failOnce.delete(text)) {
      throw new Error(`SQLITE_IOERR: ${text}`);
    }
    return false;
  },
  getString: () => undefined,
  reset: () => undefined,
  get: () => undefined,
  getColumnName: () => undefined,
  columnCount: 2,
});

const mockDb = {
  exec: vi.fn((text: string) => {
    issued.push(text);
    if (failOnce.delete(text)) {
      throw new Error(`SQLITE_IOERR: ${text}`);
    }
  }),
  prepare: vi.fn((text: string) => makeStatement(text)),
  _inTx: false,
  _spStack: [] as string[],
  close: vi.fn(),
};

vi.mock('@sqlite.org/sqlite-wasm', () => ({
  default: vi.fn(async () => ({
    oo1: {
      OpfsDb: vi.fn(function () {
        return mockDb;
      }),
      DB: vi.fn(function () {
        return mockDb;
      }),
    },
  })),
}));

vi.mock('./env.ts', () => ({ getDBFolder: vi.fn(() => 'test-folder') }));

describe('the wasm driver when a COMMIT fails', () => {
  beforeEach(() => {
    issued = [];
    failOnce = new Set();
    mockDb._inTx = false;
    mockDb._spStack = [];
  });

  it('discards the transaction the failed COMMIT leaves open', async () => {
    const kdb = await makeSQLKernelDatabase({});
    // endCrank, with the crank's outermost savepoint still listed.
    mockDb._inTx = true;
    mockDb._spStack = ['t0'];
    issued = [];

    // RELEASE SAVEPOINT t0 succeeds, so `commitIfNeeded` runs. The COMMIT fails.
    failOnce.add('COMMIT TRANSACTION');
    expect(() => kdb.releaseSavepoint('t0')).toThrow('SQLITE_IOERR');

    // The driver now believes there is no transaction, so nothing it does later
    // will end one: `rollbackIfNeeded` reads the false flag and returns, and
    // `commitIfNeeded` needs a savepoint release to be called again. Every plain
    // `kvSet` between here and then joins the surviving transaction and reports
    // success.
    expect(mockDb._inTx).toBe(false);
    expect(issued).toContain('ROLLBACK TRANSACTION');
  });
});
