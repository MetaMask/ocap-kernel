import { makeLogger } from '@ocap/utils';
import type { Database } from 'better-sqlite3';
// eslint-disable-next-line @typescript-eslint/naming-convention
import Sqlite from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { SQL_QUERIES, DEFAULT_DB_FILENAME } from './common.ts';
import { getDBFolder } from './env.ts';
import type { KVStore, VatStore, KernelDatabase } from '../types.ts';

/**
 * Ensure that SQLite is initialized.
 *
 * @param dbFilename - The filename of the database to use.
 * @param logger - An optional logger to pass to the Sqlite constructor.
 * @param verbose - If true, log database activity.
 * @returns The SQLite database object.
 */
async function initDB(
  dbFilename: string,
  logger: ReturnType<typeof makeLogger>,
  verbose: boolean,
): Promise<Database> {
  const dbPath = await getDBFilename(dbFilename);
  logger.debug('dbPath:', dbPath);
  return new Sqlite(dbPath, {
    verbose: verbose ? (...args) => logger.info(...args) : undefined,
  });
}

/**
 * Makes a persistent {@link KVStore} on top of a SQLite database.
 *
 * @param db - The (open) database to use.
 * @returns A key/value store using the given database.
 */
function makeKVStore(db: Database): KVStore {
  const sqlKVInit = db.prepare(SQL_QUERIES.CREATE_TABLE);
  sqlKVInit.run();

  const sqlKVGet = db.prepare<[string], string>(SQL_QUERIES.GET);
  sqlKVGet.pluck(true);

  /**
   * Read a key's value from the database.
   *
   * @param key - A key to fetch.
   * @param required - True if it is an error for the entry not to be there.
   * @returns The value at that key.
   */
  function kvGet(key: string, required: boolean): string | undefined {
    const result = sqlKVGet.get(key);
    if (required && !result) {
      throw Error(`no record matching key '${key}'`);
    }
    return result;
  }

  const sqlKVGetNextKey = db.prepare(SQL_QUERIES.GET_NEXT);
  sqlKVGetNextKey.pluck(true);

  /**
   * Get the lexicographically next key in the KV store after a given key.
   *
   * @param previousKey - The key you want to know the key after.
   *
   * @returns The key after `previousKey`, or undefined if `previousKey` is the
   *   last key in the store.
   */
  function kvGetNextKey(previousKey: string): string | undefined {
    if (typeof previousKey !== 'string') {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`previousKey ${previousKey} must be a string`);
    }
    return sqlKVGetNextKey.get(previousKey) as string | undefined;
  }

  const sqlKVSet = db.prepare(SQL_QUERIES.SET);

  /**
   * Set the value associated with a key in the database.
   *
   * @param key - A key to assign.
   * @param value - The value to assign to it.
   */
  function kvSet(key: string, value: string): void {
    sqlKVSet.run(key, value);
  }

  const sqlKVDelete = db.prepare(SQL_QUERIES.DELETE);

  /**
   * Delete a key from the database.
   *
   * @param key - The key to remove.
   */
  function kvDelete(key: string): void {
    sqlKVDelete.run(key);
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
 * @param options - The options for the database.
 * @param options.dbFilename - The filename of the database to use. Defaults to {@link DEFAULT_DB_FILENAME}.
 * @param options.label - A logger prefix label. Defaults to '[sqlite]'.
 * @param options.verbose - If true, generate logger output; if false, be quiet.
 * @returns The key/value store to base the kernel store on.
 */
export async function makeSQLKernelDatabase({
  dbFilename,
  label,
  verbose = false,
}: {
  dbFilename?: string | undefined;
  label?: string | undefined;
  verbose?: boolean | undefined;
}): Promise<KernelDatabase> {
  const logger = makeLogger(label ?? '[sqlite]');
  const db = await initDB(dbFilename ?? DEFAULT_DB_FILENAME, logger, verbose);

  const kvStore = makeKVStore(db);

  const sqlKVInitVS = db.prepare(SQL_QUERIES.CREATE_TABLE_VS);
  sqlKVInitVS.run();

  const sqlKVClear = db.prepare(SQL_QUERIES.CLEAR);
  const sqlKVClearVS = db.prepare(SQL_QUERIES.CLEAR_VS);

  /**
   * Delete everything from the database.
   */
  function kvClear(): void {
    sqlKVClear.run();
    sqlKVClearVS.run();
  }

  /**
   * Execute an arbitrary query and return the results.
   *
   * @param sql - The query to execute.
   * @returns The results
   */
  function kvExecuteQuery(sql: string): Record<string, string>[] {
    const query = db.prepare(sql);
    return query.all() as Record<string, string>[];
  }

  const sqlVatstoreGetAll = db.prepare(SQL_QUERIES.GET_ALL_VS);
  const sqlVatstoreSet = db.prepare(SQL_QUERIES.SET_VS);
  const sqlVatstoreDelete = db.prepare(SQL_QUERIES.DELETE_VS);

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
      type KVPair = {
        key: string;
        value: string;
      };
      for (const kvPair of sqlVatstoreGetAll.iterate(vatID)) {
        const { key, value } = kvPair as KVPair;
        result.set(key, value);
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
      db.transaction(() => {
        for (const [key, value] of sets.entries()) {
          sqlVatstoreSet.run(vatID, key, value);
        }
        for (const value of deletes.values()) {
          sqlVatstoreDelete.run(vatID, value);
        }
      })();
    }

    return {
      getKVData,
      updateKVData,
    };
  }

  return {
    kernelKVStore: kvStore,
    executeQuery: kvExecuteQuery,
    clear: db.transaction(kvClear),
    makeVatStore,
  };
}

/**
 * Get the filename for a database.
 *
 * @param label - A label for the database.
 * @returns The filename for the database.
 */
export async function getDBFilename(label: string): Promise<string> {
  if (label.startsWith(':')) {
    return label;
  }
  const dbRoot = join(tmpdir(), './ocap-sqlite', getDBFolder());
  await mkdir(dbRoot, { recursive: true });
  return join(dbRoot, label);
}
