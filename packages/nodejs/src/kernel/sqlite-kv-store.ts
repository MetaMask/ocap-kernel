import type { KVStore } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';
import type { Database } from '@sqlite.org/sqlite-wasm';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

// No changes made to this file, besides this comment.
// If used, this file should be deduped with its copy
// in the extension package. This works (to the extent
// that it does) in the node environment because of the
// shims in env.js

/**
 * Ensure that SQLite is initialized.
 *
 * @returns The SQLite database object.
 */
async function initDB(): Promise<Database> {
  const sqlite3 = await sqlite3InitModule();
  if (sqlite3.oo1.OpfsDb) {
    return new sqlite3.oo1.OpfsDb('/testdb.sqlite', 'cwt');
  }
  console.warn(`OPFS not enabled, database will be ephemeral`);
  return new sqlite3.oo1.DB('/testdb.sqlite', 'cwt');
}

/**
 * Makes a {@link KVStore} for low-level persistent storage.
 *
 * @param label - A logger prefix label. Defaults to '[sqlite]'.
 * @returns The key/value store to base the kernel store on.
 */
export async function makeSQLKVStore(
  label: string = '[sqlite]',
): Promise<KVStore> {
  const logger = makeLogger(label);
  const db = await initDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT,
      value TEXT,
      PRIMARY KEY(key)
    )
  `);

  const sqlKVGet = db.prepare(`
    SELECT value
    FROM kv
    WHERE key = ?
  `);

  /**
   * Read a key's value from the database.
   *
   * @param key - A key to fetch.
   * @param required - True if it is an error for the entry not to be there.
   * @returns The value at that key.
   */
  function kvGet(key: string, required: boolean): string {
    sqlKVGet.bind([key]);
    if (sqlKVGet.step()) {
      const result = sqlKVGet.getString(0);
      if (result) {
        sqlKVGet.reset();
        logger.debug(`kernel get '${key}' as '${result}'`);
        return result;
      }
    }
    sqlKVGet.reset();
    if (required) {
      throw Error(`no record matching key '${key}'`);
    } else {
      // Sometimes, we really lean on TypeScript's unsoundness
      return undefined as unknown as string;
    }
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
    logger.debug(`kernel set '${key}' to '${value}'`);
    sqlKVSet.bind([key, value]);
    sqlKVSet.step();
    sqlKVSet.reset();
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
    logger.debug(`kernel delete '${key}'`);
    sqlKVDelete.bind([key]);
    sqlKVDelete.step();
    sqlKVDelete.reset();
  }

  const sqlKVTruncate = db.prepare(`
    TRUNCATE TABLE kv
  `);

  /**
   * Delete all keys and values from the database.
   */
  function kvTruncate(): void {
    logger.debug(`kernel truncate`);
    sqlKVTruncate.step();
    sqlKVTruncate.reset();
  }

  return {
    get: (key) => kvGet(key, false),
    getRequired: (key) => kvGet(key, true),
    set: kvSet,
    delete: kvDelete,
    truncate: kvTruncate,
  };
}
