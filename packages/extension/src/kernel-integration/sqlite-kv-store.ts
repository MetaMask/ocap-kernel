import type { KVStore } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';
import type { Database } from '@sqlite.org/sqlite-wasm';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

/**
 * Ensure that SQLite is initialized.
 *
 * @param beEphemeral - If true, create an ephemeral (in memory) database.
 * @returns The SQLite database object.
 */
async function initDB(beEphemeral: boolean): Promise<Database> {
  const sqlite3 = await sqlite3InitModule();
  if (!beEphemeral) {
    if (sqlite3.oo1.OpfsDb) {
      return new sqlite3.oo1.OpfsDb('/testdb.sqlite', 'cw');
    }
    console.warn(`OPFS not enabled, database will be ephemeral`);
  }
  return new sqlite3.oo1.DB(':memory:', 'cw');
}

/**
 * Makes a {@link KVStore} for low-level persistent storage.
 *
 * @param label - A logger prefix label. Defaults to '[sqlite]'.
 * @param beEphemeral - If true, create an ephemeral (in memory) database.
 * @returns A key/value store to base higher level stores on.
 */
export async function makeSQLKVStore(
  label: string = '[sqlite]',
  beEphemeral: boolean = false,
): Promise<KVStore> {
  const logger = makeLogger(label);
  const db = await initDB(beEphemeral);

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
        logger.debug(`kv get '${key}' as '${result}'`);
        return result;
      }
    }
    sqlKVGet.reset();
    if (required) {
      throw Error(`[${label}] no record matching key '${key}'`);
    } else {
      // Sometimes, we really lean on TypeScript's unsoundness
      return undefined as unknown as string;
    }
  }

  const sqlKVGetNextKey = db.prepare(`
    SELECT key
    FROM kv
    WHERE key > ?
    LIMIT 1
  `);

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
    logger.debug(`kv set '${key}' to '${value}'`);
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
    logger.debug(`kv delete '${key}'`);
    sqlKVDelete.bind([key]);
    sqlKVDelete.step();
    sqlKVDelete.reset();
  }

  const sqlKVClear = db.prepare(`
    DELETE FROM kv
  `);

  /**
   * Delete all entries from the database.
   */
  function kvClear(): void {
    logger.log('clearing all kernel state');
    sqlKVClear.step();
    sqlKVClear.reset();
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

  return {
    get: (key) => kvGet(key, false),
    getNextKey: kvGetNextKey,
    getRequired: (key) => kvGet(key, true),
    set: kvSet,
    delete: kvDelete,
    clear: kvClear,
    executeQuery,
  };
}
