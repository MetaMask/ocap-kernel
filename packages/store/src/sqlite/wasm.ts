import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';
import type { Database, PreparedStatement } from '@sqlite.org/sqlite-wasm';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

import { SQL_QUERIES } from './common.ts';
import type { KVStore, VatStore, KernelDatabase } from '../types.ts';

/**
 * Ensure that SQLite is initialized.
 *
 * @param dbFilename - The filename of the database to use.
 * @returns The SQLite database object.
 */
async function initDB(dbFilename: string): Promise<Database> {
  const sqlite3 = await sqlite3InitModule();
  if (sqlite3.oo1.OpfsDb) {
    return new sqlite3.oo1.OpfsDb(dbFilename, 'cw');
  }
  console.warn(`OPFS not enabled, database will be ephemeral`);

  return new sqlite3.oo1.DB(`:memory:`, 'cw');
}

/**
 * Helper function to paper over SQLite-wasm awfulness.  Runs a prepared
 * statement as it would be run in a more sensible API.
 *
 * @param stmt - A prepared statement to run.
 * @param bindings - Optional parameters to bind for execution.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function run(stmt: PreparedStatement, ...bindings: string[]): void {
  if (bindings && bindings.length > 0) {
    stmt.bind(bindings);
  }
  stmt.step();
  stmt.reset();
}

/**
 * Makes a {@link KVStore} on top of a SQLite database
 *
 * @param db - The (open) database to use.
 * @param logger - A logger object for recording activity.
 * @param label - Label string for this store, for use in log messages.
 * @returns A key/value store using the given database.
 */
function makeKVStore(db: Database, logger: Logger, label: string): KVStore {
  db.exec(SQL_QUERIES.CREATE_TABLE);

  const sqlKVGet = db.prepare(SQL_QUERIES.GET);

  /**
   * Read a key's value from the database.
   *
   * @param key - A key to fetch.
   * @param required - True if it is an error for the entry not to be there.
   * @returns The value at that key.
   */
  function kvGet(key: string, required: boolean): string | undefined {
    sqlKVGet.bind([key]);
    if (sqlKVGet.step()) {
      const result = sqlKVGet.getString(0);
      if (result) {
        sqlKVGet.reset();
        logger.debug(`kv get '${key}' as '${result}'`);
        return result;
      }
    }
    sqlKVGet.reset();
    if (required) {
      throw Error(`[${label}] no record matching key '${key}'`);
    }
    return undefined;
  }

  const sqlKVGetNextKey = db.prepare(SQL_QUERIES.GET_NEXT);

  /**
   * Get the lexicographically next key in the KV store after a given key.
   *
   * @param previousKey - The key you want to know the key after.
   *
   * @returns The key after `previousKey`, or undefined if `previousKey` is the
   *   last key in the store.
   */
  function kvGetNextKey(previousKey: string): string | undefined {
    sqlKVGetNextKey.bind([previousKey]);
    if (sqlKVGetNextKey.step()) {
      const result = sqlKVGetNextKey.getString(0);
      if (result) {
        sqlKVGetNextKey.reset();
        logger.debug(`kv getNextKey '${previousKey}' as '${result}'`);
        return result;
      }
    }
    sqlKVGetNextKey.reset();
    return undefined;
  }

  const sqlKVSet = db.prepare(SQL_QUERIES.SET);

  /**
   * Set the value associated with a key in the database.
   *
   * @param key - A key to assign.
   * @param value - The value to assign to it.
   */
  function kvSet(key: string, value: string): void {
    logger.debug(`kv set '${key}' to '${value}'`);
    sqlKVSet.bind([key, value]);
    sqlKVSet.step();
    sqlKVSet.reset();
  }

  const sqlKVDelete = db.prepare(SQL_QUERIES.DELETE);

  /**
   * Delete a key from the database.
   *
   * @param key - The key to remove.
   */
  function kvDelete(key: string): void {
    logger.debug(`kv delete '${key}'`);
    sqlKVDelete.bind([key]);
    sqlKVDelete.step();
    sqlKVDelete.reset();
  }

  return {
    get: (key) => kvGet(key, false),
    getNextKey: kvGetNextKey,
    getRequired: (key) => kvGet(key, true) as string,
    set: kvSet,
    delete: kvDelete,
  };
}

/**
 * Makes a {@link KernelDatabase} for low-level persistent storage.
 *
 * @param dbFilename - The filename of the database to use. Defaults to 'store.db'.
 * @param label - A logger prefix label. Defaults to '[sqlite]'.
 * @param verbose - If true, generate logger output; if false, be quiet.
 * @returns A key/value store to base higher level stores on.
 */
export async function makeSQLKernelDatabase(
  dbFilename: string = 'store.db',
  label: string = '[sqlite]',
  verbose: boolean = false,
): Promise<KernelDatabase> {
  const logger = makeLogger(label);
  const db = await initDB(dbFilename);

  if (verbose) {
    logger.log('Initializing kernel store');
  }

  const kvStore = makeKVStore(db, logger, label);

  db.exec(SQL_QUERIES.CREATE_TABLE_VS);

  const sqlKVClear = db.prepare(SQL_QUERIES.CLEAR);
  const sqlKVClearVS = db.prepare(SQL_QUERIES.CLEAR_VS);

  /**
   * Delete everything from the database.
   */
  function kvClear(): void {
    if (verbose) {
      logger.log('clearing all kernel state');
    }
    sqlKVClear.step();
    sqlKVClear.reset();
    sqlKVClearVS.step();
    sqlKVClearVS.reset();
  }

  /**
   * Execute a SQL query.
   *
   * @param sql - The SQL query to execute.
   * @returns An array of results.
   */
  function executeQuery(sql: string): Record<string, string>[] {
    const stmt = db.prepare(sql);
    const results: Record<string, string>[] = [];
    try {
      const { columnCount } = stmt;
      while (stmt.step()) {
        const row: Record<string, string> = {};
        for (let i = 0; i < columnCount; i++) {
          const columnName = stmt.getColumnName(i);
          if (columnName) {
            row[columnName] = String(stmt.get(i) as string);
          }
        }
        results.push(row);
      }
    } finally {
      stmt.reset();
    }
    return results;
  }

  const sqlVatstoreGetAll = db.prepare(SQL_QUERIES.GET_ALL_VS);
  const sqlVatstoreSet = db.prepare(SQL_QUERIES.SET_VS);
  const sqlVatstoreDelete = db.prepare(SQL_QUERIES.DELETE_VS);
  const sqlBeginTransaction = db.prepare(SQL_QUERIES.BEGIN_TRANSACTION);
  const sqlCommitTransaction = db.prepare(SQL_QUERIES.COMMIT_TRANSACTION);
  const sqlAbortTransaction = db.prepare(SQL_QUERIES.ABORT_TRANSACTION);

  /**
   * Create a new VatStore for a vat.
   *
   * @param vatID - The vat for which this is being done.
   *
   * @returns a a VatStore object for the given vat.
   */
  function makeVatStore(vatID: string): VatStore {
    /**
     * Fetch all the data in the vatstore.
     *
     * @returns the vatstore contents as a key-value Map.
     */
    function getKVData(): Map<string, string> {
      const result = new Map<string, string>();
      sqlVatstoreGetAll.bind([vatID]);
      try {
        while (sqlVatstoreGetAll.step()) {
          const key = sqlVatstoreGetAll.getString(0) as string;
          const value = sqlVatstoreGetAll.getString(1) as string;
          result.set(key, value);
        }
      } finally {
        sqlVatstoreGetAll.reset();
      }
      return result;
    }

    /**
     * Update the state of the vatstore
     *
     * @param sets - A map of key values that have been changed.
     * @param deletes - A set of keys that have been deleted.
     */
    function updateKVData(
      sets: Map<string, string>,
      deletes: Set<string>,
    ): void {
      try {
        sqlBeginTransaction.step();
        sqlBeginTransaction.reset();
        for (const [key, value] of sets.entries()) {
          sqlVatstoreSet.bind([vatID, key, value]);
          sqlVatstoreSet.step();
          sqlVatstoreSet.reset();
        }
        for (const value of deletes.values()) {
          sqlVatstoreDelete.bind([vatID, value]);
          sqlVatstoreDelete.step();
          sqlVatstoreDelete.reset();
        }
        sqlCommitTransaction.step();
        sqlCommitTransaction.reset();
      } catch (problem) {
        sqlAbortTransaction.step();
        sqlAbortTransaction.reset();
        throw problem;
      }
    }

    return {
      getKVData,
      updateKVData,
    };
  }

  return {
    kernelKVStore: kvStore,
    clear: kvClear,
    executeQuery,
    makeVatStore,
  };
}
