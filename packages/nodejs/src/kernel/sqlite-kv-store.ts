import type { KVStore } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';
import type { Database } from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// We require require because the ESM import does not work properly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sqlite = require('better-sqlite3');

const dbRoot = join(tmpdir(), './db');

/**
 * Ensure that SQLite is initialized.
 *
 * @param logger - An optional logger to pass to the Sqlite constructor.
 * @returns The SQLite database object.
 */
async function initDB(
  logger?: ReturnType<typeof makeLogger>,
): Promise<Database> {
  const dbPath = join(dbRoot, 'store.db');
  await mkdir(dbRoot, { recursive: true });
  return new Sqlite(dbPath);
}

/**
 * Makes a {@link KVStore} for low-level persistent storage.
 *
 * @param label - A logger prefix label. Defaults to '[sqlite]'.
 * @param verbose
 * @returns The key/value store to base the kernel store on.
 */
export async function makeSQLKVStore(
  label: string = '[sqlite]',
  verbose: boolean = false,
): Promise<KVStore> {
  const db = await initDB(verbose ? makeLogger(label) : undefined);

  const sqlKVInit = db.prepare(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT,
      value TEXT,
      PRIMARY KEY(key)
    )
  `);

  sqlKVInit.run();

  const sqlKVGet = db.prepare(`
    SELECT value
    FROM kv
    WHERE key = ?
  `);
  sqlKVGet.pluck(true);

  /**
   * Read a key's value from the database.
   *
   * @param key - A key to fetch.
   * @param required - True if it is an error for the entry not to be there.
   * @returns The value at that key.
   */
  function kvGet(key: string, required: boolean): string {
    const result = sqlKVGet.get(key);
    if (required && !result) {
      throw Error(`no record matching key '${key}'`);
    }
    return result as string;
  }

  const sqlKVGetNextKey = db.prepare(`
    SELECT key
    FROM kv
    WHERE key > ?
    LIMIT 1
  `);
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

  const sqlKVSet = db.prepare(`
    INSERT INTO kv (key, value)
    VALUES (?, ?)
    ON CONFLICT DO UPDATE SET value = excluded.value
  `);

  /**
   * Set the value associated with a key in the database.
   *
   * @param key - A key to assign.
   * @param value - The value to assign to it.
   */
  function kvSet(key: string, value: string): void {
    sqlKVSet.run(key, value);
  }

  const sqlKVDelete = db.prepare(`
    DELETE FROM kv
    WHERE key = ?
  `);

  /**
   * Delete a key from the database.
   *
   * @param key - The key to remove.
   */
  function kvDelete(key: string): void {
    sqlKVDelete.run(key);
  }

  const sqlKVDrop = db.prepare(`
    DROP TABLE kv
  `);

  /**
   * Delete all keys and values from the database.
   */
  function kvClear(): void {
    sqlKVDrop.run();
    sqlKVInit.run();
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

  return {
    get: (key) => kvGet(key, false),
    getNextKey: kvGetNextKey,
    getRequired: (key) => kvGet(key, true),
    set: kvSet,
    delete: kvDelete,
    executeQuery: kvExecuteQuery,
    clear: db.transaction(kvClear),
  };
}
