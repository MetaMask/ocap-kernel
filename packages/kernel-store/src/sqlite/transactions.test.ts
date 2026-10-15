import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi } from 'vitest';

import { SQL_QUERIES } from './common.ts';
import { makeTransactionMethods } from './transactions.ts';

const { BEGIN_TRANSACTION, COMMIT_TRANSACTION, ABORT_TRANSACTION } =
  SQL_QUERIES;

/**
 * A fake database whose `inTransaction` follows the BEGIN, COMMIT and ROLLBACK
 * that succeed; a statement that throws changes nothing.
 * `endTransactionBehindOurBack` stands in for SQLite rolling back on its own
 * after `SQLITE_FULL`, and `write` is a guarded write that does nothing.
 *
 * @returns The fake database, its levers, and the methods built over it.
 */
const makeFakeDriver = () => {
  let inTransaction = false;
  const issued: string[] = [];
  const failOnce = new Set<string>();

  let abortLeavesItOpen = false;

  const run = (sql: string): void => {
    issued.push(sql);
    if (failOnce.delete(sql)) {
      throw new Error(`SQLITE_IOERR: ${sql}`);
    }
    if (sql === BEGIN_TRANSACTION) {
      inTransaction = true;
    } else if (sql === COMMIT_TRANSACTION) {
      inTransaction = false;
    } else if (sql === ABORT_TRANSACTION) {
      inTransaction = abortLeavesItOpen;
    }
  };

  const db = {
    get inTransaction() {
      return inTransaction;
    },
    _spStack: [] as string[],
    exec: vi.fn(run),
  };
  const begin = vi.fn(() => run(BEGIN_TRANSACTION));
  const commit = vi.fn(() => run(COMMIT_TRANSACTION));
  const abort = vi.fn(() => run(ABORT_TRANSACTION));
  const logger = { error: vi.fn() } as unknown as Logger;
  const methods = makeTransactionMethods({ db, begin, commit, abort, logger });

  return {
    db,
    issued,
    failOnce,
    begin,
    commit,
    abort,
    logger,
    endTransactionBehindOurBack: () => {
      inTransaction = false;
    },
    keepTransactionOpenPastTheAbort: () => {
      abortLeavesItOpen = true;
    },
    ...methods,
    write: methods.guardWrite(() => undefined),
  };
};

type FakeDriver = ReturnType<typeof makeFakeDriver>;

describe('makeTransactionMethods', () => {
  it('opens a transaction for the outermost savepoint', () => {
    const { db, begin, createSavepoint } = makeFakeDriver();

    createSavepoint('t0');

    expect(begin).toHaveBeenCalledOnce();
    expect(db.exec).toHaveBeenCalledWith('SAVEPOINT t0');
    expect(db._spStack).toStrictEqual(['t0']);
  });

  it('nests a savepoint in the transaction the outer one opened', () => {
    const { db, begin, commit, createSavepoint, releaseSavepoint } =
      makeFakeDriver();

    createSavepoint('t0');
    createSavepoint('t1');
    expect(begin).toHaveBeenCalledOnce();
    expect(db._spStack).toStrictEqual(['t0', 't1']);

    releaseSavepoint('t1');
    expect(commit).not.toHaveBeenCalled();
    releaseSavepoint('t0');
    expect(commit).toHaveBeenCalledOnce();
    expect(db._spStack).toStrictEqual([]);
  });

  it.each([
    'invalid-name',
    '123numeric',
    'spaces not allowed',
    "point'; DROP TABLE kv--",
  ])('rejects the savepoint name %j without opening a transaction', (name) => {
    const { db, issued, createSavepoint } = makeFakeDriver();

    expect(() => createSavepoint(name)).toThrow('Invalid identifier');
    expect(issued).toStrictEqual([]);
    expect(db.inTransaction).toBe(false);
  });

  it.each(['rollbackSavepoint', 'releaseSavepoint'] as const)(
    '%s refuses a savepoint that is not on the stack',
    (method) => {
      const methods = makeFakeDriver();
      methods.createSavepoint('t0');

      expect(() => methods[method]('t1')).toThrow('No such savepoint: t1');
    },
  );

  it.each([
    { method: 'rollbackSavepoint', sql: 'ROLLBACK TO SAVEPOINT a' },
    { method: 'releaseSavepoint', sql: 'RELEASE SAVEPOINT a' },
  ] as const)(
    '$method takes a repeated name to its newest savepoint, as SQLite does',
    ({ method, sql }) => {
      const methods = makeFakeDriver();
      methods.createSavepoint('a');
      methods.createSavepoint('b');
      methods.createSavepoint('a');

      methods[method]('a');

      expect(methods.db.exec).toHaveBeenLastCalledWith(sql);
      expect(methods.db._spStack).toStrictEqual(['a', 'b']);
      expect(methods.commit).not.toHaveBeenCalled();
      expect(methods.abort).not.toHaveBeenCalled();
    },
  );

  it('rolls back to a savepoint and drops the ones above it', () => {
    const { db, abort, createSavepoint, rollbackSavepoint } = makeFakeDriver();
    createSavepoint('t0');
    createSavepoint('t1');
    createSavepoint('t2');

    rollbackSavepoint('t1');

    expect(db.exec).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT t1');
    expect(db._spStack).toStrictEqual(['t0']);
    expect(abort).not.toHaveBeenCalled();
  });

  it('aborts the transaction when the last savepoint rolls back', () => {
    const { db, abort, createSavepoint, rollbackSavepoint } = makeFakeDriver();
    createSavepoint('t0');

    rollbackSavepoint('t0');

    expect(abort).toHaveBeenCalledOnce();
    expect(db._spStack).toStrictEqual([]);
  });

  it('releases a savepoint and drops the ones above it', () => {
    const { db, commit, createSavepoint, releaseSavepoint } = makeFakeDriver();
    createSavepoint('t0');
    createSavepoint('t1');
    createSavepoint('t2');

    releaseSavepoint('t1');

    expect(db.exec).toHaveBeenCalledWith('RELEASE SAVEPOINT t1');
    expect(db._spStack).toStrictEqual(['t0']);
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits the transaction when the last savepoint is released', () => {
    const { db, commit, createSavepoint, releaseSavepoint } = makeFakeDriver();
    createSavepoint('t0');

    releaseSavepoint('t0');

    expect(db.exec).toHaveBeenCalledWith('RELEASE SAVEPOINT t0');
    expect(commit).toHaveBeenCalledOnce();
    expect(db._spStack).toStrictEqual([]);
  });

  it('discards the transaction when the rollback itself fails', () => {
    const { db, abort, failOnce, createSavepoint, rollbackSavepoint } =
      makeFakeDriver();
    createSavepoint('t0');
    failOnce.add('ROLLBACK TO SAVEPOINT t0');

    expect(() => rollbackSavepoint('t0')).toThrow('SQLITE_IOERR');

    expect(abort).toHaveBeenCalledOnce();
    expect(db._spStack).toStrictEqual([]);
    expect(db.inTransaction).toBe(false);
  });

  it('reports the rollback failure even if the abort fails too', () => {
    const { db, abort, failOnce, createSavepoint, rollbackSavepoint } =
      makeFakeDriver();
    createSavepoint('t0');
    failOnce.add('ROLLBACK TO SAVEPOINT t0');
    failOnce.add(ABORT_TRANSACTION);

    expect(() => rollbackSavepoint('t0')).toThrow(
      'SQLITE_IOERR: ROLLBACK TO SAVEPOINT t0',
    );

    expect(abort).toHaveBeenCalledOnce();
    expect(db._spStack).toStrictEqual([]);
  });

  describe('a transaction SQLite ended itself', () => {
    const lose = (): FakeDriver => {
      const driver = makeFakeDriver();
      driver.createSavepoint('t0');
      driver.createSavepoint('t1');
      driver.endTransactionBehindOurBack();
      driver.issued.length = 0;
      return driver;
    };

    it.each([
      {
        what: 'a write',
        write: (driver: FakeDriver) => driver.write(),
      },
      {
        what: 'a transaction',
        write: (driver: FakeDriver) => driver.beginIfNeeded(),
      },
      {
        what: 'a savepoint',
        write: (driver: FakeDriver) => driver.createSavepoint('t2'),
      },
    ])(
      'refuses $what until its savepoints are rolled back or released',
      ({ write }) => {
        const driver = lose();

        expect(() => write(driver)).toThrow(
          'SQLite ended the transaction holding savepoint t0; refusing writes',
        );
        expect(driver.issued).toStrictEqual([]);
      },
    );

    it.each([
      { method: 'rollbackSavepoint', name: 't1' },
      { method: 'releaseSavepoint', name: 't0' },
    ] as const)(
      'tells the caller of $method, then writes again',
      ({ method, name }) => {
        const driver = lose();

        expect(() => driver[method](name)).toThrow(
          `SQLite already ended the transaction holding savepoint ${name}`,
        );
        expect(driver.db._spStack).toStrictEqual([]);

        driver.createSavepoint('t0');
        driver.releaseSavepoint('t0');
        expect(driver.issued).toStrictEqual([
          BEGIN_TRANSACTION,
          'SAVEPOINT t0',
          'RELEASE SAVEPOINT t0',
          COMMIT_TRANSACTION,
        ]);
      },
    );

    it.each(['rollbackSavepoint', 'releaseSavepoint'] as const)(
      'keeps refusing after %s of a savepoint it never held',
      (method) => {
        const driver = lose();

        expect(() => driver[method]('t9')).toThrow('No such savepoint: t9');
        expect(driver.db._spStack).toStrictEqual(['t0', 't1']);
        expect(driver.write).toThrow('refusing writes');
      },
    );

    it('keeps the error of the write SQLite rolled back on as the cause', () => {
      const driver = makeFakeDriver();
      driver.createSavepoint('t0');
      const full = new Error('SQLITE_FULL');
      const write = driver.guardWrite(() => {
        driver.endTransactionBehindOurBack();
        throw full;
      });

      expect(write).toThrow(full);
      expect(driver.write).toThrow(expect.objectContaining({ cause: full }));
      expect(() => driver.rollbackSavepoint('t0')).toThrow(
        expect.objectContaining({
          message: 'SQLite already ended the transaction holding savepoint t0',
          cause: full,
        }),
      );

      driver.createSavepoint('t0');
      driver.endTransactionBehindOurBack();
      expect(driver.write).toThrow(
        expect.objectContaining({ cause: undefined }),
      );
    });

    it('keeps the failed write as the cause however many writes it refuses after', () => {
      const driver = makeFakeDriver();
      driver.createSavepoint('t0');
      const full = new Error('SQLITE_FULL');
      const write = driver.guardWrite(() => {
        driver.endTransactionBehindOurBack();
        throw full;
      });
      expect(write).toThrow(full);

      expect(driver.write).toThrow(expect.objectContaining({ cause: full }));
      expect(driver.write).toThrow(expect.objectContaining({ cause: full }));
      expect(() => driver.rollbackSavepoint('t0')).toThrow(
        expect.objectContaining({ cause: full }),
      );
    });

    it('does not blame the loss on a write that failed while the transaction was live', () => {
      const driver = makeFakeDriver();
      driver.createSavepoint('t0');
      const constraint = new Error('SQLITE_CONSTRAINT');
      const write = driver.guardWrite(() => {
        throw constraint;
      });
      expect(write).toThrow(constraint);

      driver.endTransactionBehindOurBack();

      expect(driver.write).toThrow(
        expect.objectContaining({ cause: undefined }),
      );
    });
  });

  it('leaves an open transaction to whoever began it', () => {
    const { begin, beginIfNeeded } = makeFakeDriver();
    expect(beginIfNeeded()).toBe(true);

    expect(beginIfNeeded()).toBe(false);
    expect(begin).toHaveBeenCalledOnce();
  });

  it('leaves the commit to the savepoint that owns the transaction', () => {
    const { commit, createSavepoint, commitIfNeeded } = makeFakeDriver();
    createSavepoint('t0');

    commitIfNeeded();

    expect(commit).not.toHaveBeenCalled();
  });

  it('commitIfNeeded does nothing outside a transaction', () => {
    const { commit, commitIfNeeded } = makeFakeDriver();

    commitIfNeeded();

    expect(commit).not.toHaveBeenCalled();
  });

  describe('a transaction an abort could not end', () => {
    const abandon = () => {
      const driver = makeFakeDriver();
      driver.createSavepoint('t0');
      driver.createSavepoint('t1');
      driver.failOnce.add('ROLLBACK TO SAVEPOINT t1');
      driver.failOnce.add(ABORT_TRANSACTION);

      expect(() => driver.rollbackSavepoint('t1')).toThrow('SQLITE_IOERR');
      expect(driver.db._spStack).toStrictEqual([]);
      expect(driver.db.inTransaction).toBe(true);
      driver.issued.length = 0;
      return driver;
    };

    it('discards it before the next savepoint can join it', () => {
      const { issued, createSavepoint, releaseSavepoint } = abandon();

      createSavepoint('teardown');
      releaseSavepoint('teardown');

      expect(issued).toStrictEqual([
        ABORT_TRANSACTION,
        BEGIN_TRANSACTION,
        'SAVEPOINT teardown',
        'RELEASE SAVEPOINT teardown',
        COMMIT_TRANSACTION,
      ]);
    });

    it.each([
      { what: 'a savepoint', write: 'createSavepoint', name: 'teardown' },
      { what: 'a rollback', write: 'rollbackSavepoint', name: 't0' },
      { what: 'a release', write: 'releaseSavepoint', name: 't0' },
    ] as const)(
      'refuses $what while the abort keeps failing',
      ({ write, name }) => {
        const driver = abandon();
        driver.failOnce.add(ABORT_TRANSACTION);

        expect(() => driver[write](name)).toThrow(
          expect.objectContaining({
            message: expect.stringContaining('refusing further writes'),
            cause: expect.objectContaining({
              message: `SQLITE_IOERR: ${ABORT_TRANSACTION}`,
            }),
          }),
        );
        expect(driver.issued).toStrictEqual([ABORT_TRANSACTION]);
      },
    );

    it('writes again once SQLite has ended it', () => {
      const { issued, endTransactionBehindOurBack, write } = abandon();
      endTransactionBehindOurBack();

      expect(write).not.toThrow();
      expect(issued).toStrictEqual([]);
    });

    it('does not commit it', () => {
      const driver = abandon();
      driver.failOnce.add(ABORT_TRANSACTION);

      expect(() => driver.commitIfNeeded()).toThrow('refusing further writes');
      expect(driver.issued).toStrictEqual([ABORT_TRANSACTION]);
    });

    it('logs the abort that fails again on the retry', () => {
      const driver = abandon();
      driver.failOnce.add(ABORT_TRANSACTION);

      expect(driver.write).toThrow('refusing further writes');
      expect(driver.logger.error).toHaveBeenLastCalledWith(
        'failed to discard transaction after abandonment',
        expect.any(Error),
      );
    });

    it('stays abandoned when the abort returns but the transaction does not end', () => {
      const {
        db,
        failOnce,
        keepTransactionOpenPastTheAbort,
        createSavepoint,
        rollbackSavepoint,
      } = makeFakeDriver();
      keepTransactionOpenPastTheAbort();
      createSavepoint('t0');
      createSavepoint('t1');
      failOnce.add('ROLLBACK TO SAVEPOINT t1');
      expect(() => rollbackSavepoint('t1')).toThrow('SQLITE_IOERR');

      expect(db.inTransaction).toBe(true);
      expect(() => createSavepoint('teardown')).toThrow(
        'refusing further writes',
      );
    });

    it('reports the abort that failed while discarding it', () => {
      const { logger } = abandon();

      expect(logger.error).toHaveBeenCalledWith(
        'failed to discard transaction after rollback',
        expect.objectContaining({
          message: `SQLITE_IOERR: ${ABORT_TRANSACTION}`,
        }),
      );
    });
  });

  it.each([
    {
      after: 'rollback',
      arrange: (driver: FakeDriver) => {
        driver.createSavepoint('t0');
        driver.failOnce.add('ROLLBACK TO SAVEPOINT t0');
        return () => driver.rollbackSavepoint('t0');
      },
    },
    {
      after: 'release',
      arrange: (driver: FakeDriver) => {
        driver.createSavepoint('t0');
        driver.createSavepoint('t1');
        driver.failOnce.add('RELEASE SAVEPOINT t1');
        return () => driver.releaseSavepoint('t1');
      },
    },
    {
      after: 'commit',
      arrange: (driver: FakeDriver) => {
        driver.createSavepoint('t0');
        driver.failOnce.add(COMMIT_TRANSACTION);
        return () => driver.releaseSavepoint('t0');
      },
    },
    {
      after: 'savepoint creation',
      arrange: (driver: FakeDriver) => {
        driver.failOnce.add('SAVEPOINT t0');
        return () => driver.createSavepoint('t0');
      },
    },
  ])('names the $after it was discarding after', ({ after, arrange }) => {
    const driver = makeFakeDriver();
    const act = arrange(driver);
    driver.failOnce.add(ABORT_TRANSACTION);

    expect(act).toThrow('SQLITE_IOERR');

    expect(driver.logger.error).toHaveBeenCalledWith(
      `failed to discard transaction after ${after}`,
      expect.any(Error),
    );
  });

  it('discards the transaction when the release fails', () => {
    const { db, issued, failOnce, createSavepoint, releaseSavepoint } =
      makeFakeDriver();
    createSavepoint('t0');
    createSavepoint('t1');
    issued.length = 0;
    failOnce.add('RELEASE SAVEPOINT t1');

    expect(() => releaseSavepoint('t1')).toThrow('SQLITE_IOERR');

    expect(issued).toStrictEqual(['RELEASE SAVEPOINT t1', ABORT_TRANSACTION]);
    expect(db.inTransaction).toBe(false);
    expect(db._spStack).toStrictEqual([]);
  });

  it('discards the transaction when the commit fails', () => {
    const { db, issued, failOnce, createSavepoint, releaseSavepoint } =
      makeFakeDriver();
    createSavepoint('t0');
    issued.length = 0;
    failOnce.add(COMMIT_TRANSACTION);

    expect(() => releaseSavepoint('t0')).toThrow('SQLITE_IOERR');

    expect(issued).toStrictEqual([
      'RELEASE SAVEPOINT t0',
      COMMIT_TRANSACTION,
      ABORT_TRANSACTION,
    ]);
    expect(db.inTransaction).toBe(false);
  });

  it('discards the transaction it began when the savepoint then fails', () => {
    const { db, issued, failOnce, createSavepoint } = makeFakeDriver();
    failOnce.add('SAVEPOINT t0');

    expect(() => createSavepoint('t0')).toThrow('SQLITE_IOERR');

    expect(issued).toStrictEqual([
      BEGIN_TRANSACTION,
      'SAVEPOINT t0',
      ABORT_TRANSACTION,
    ]);
    expect(db.inTransaction).toBe(false);
    expect(db._spStack).toStrictEqual([]);
  });

  describe('a write that leaves the transaction it began open', () => {
    const failWrite = (driver: FakeDriver) =>
      driver.guardWrite(() => {
        driver.begin();
        throw new Error('SQLITE_IOERR: write');
      });

    it('discards it', () => {
      const driver = makeFakeDriver();

      expect(failWrite(driver)).toThrow('SQLITE_IOERR: write');

      expect(driver.issued).toStrictEqual([
        BEGIN_TRANSACTION,
        ABORT_TRANSACTION,
      ]);
      expect(driver.db.inTransaction).toBe(false);
    });

    it('refuses writes if the abort fails too', () => {
      const driver = makeFakeDriver();
      driver.failOnce.add(ABORT_TRANSACTION);

      expect(failWrite(driver)).toThrow('SQLITE_IOERR: write');

      expect(driver.logger.error).toHaveBeenCalledWith(
        'failed to discard transaction after write',
        expect.objectContaining({
          message: `SQLITE_IOERR: ${ABORT_TRANSACTION}`,
        }),
      );
      driver.failOnce.add(ABORT_TRANSACTION);
      expect(driver.write).toThrow('refusing further writes');
    });

    it('leaves one a savepoint holds to its owner', () => {
      const driver = makeFakeDriver();
      driver.createSavepoint('t0');
      driver.issued.length = 0;
      const write = driver.guardWrite(() => {
        throw new Error('SQLITE_CONSTRAINT');
      });

      expect(write).toThrow('SQLITE_CONSTRAINT');

      expect(driver.issued).toStrictEqual([]);
      expect(driver.db.inTransaction).toBe(true);
    });
  });

  it('leaves a transaction it found open for its owner to discard', () => {
    const { db, issued, failOnce, createSavepoint } = makeFakeDriver();
    createSavepoint('t0');
    issued.length = 0;
    failOnce.add('SAVEPOINT t1');

    expect(() => createSavepoint('t1')).toThrow('SQLITE_IOERR');

    expect(issued).toStrictEqual(['SAVEPOINT t1']);
    expect(db.inTransaction).toBe(true);
    expect(db._spStack).toStrictEqual(['t0']);
  });
});
