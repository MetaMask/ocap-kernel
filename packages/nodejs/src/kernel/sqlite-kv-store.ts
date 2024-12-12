import { hasProperty, isObject } from '@metamask/utils';
import type { KVStore } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';
// eslint-disable-next-line @typescript-eslint/naming-convention
import Sqlite from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = resolve(new URL('../db/store.db', import.meta.url).pathname);

// No changes made to this file, besides this comment.
// If used, this file should be deduped with its copy
// in the extension package. This works (to the extent
// that it does) in the node environment because of the
// shims in env.js

/**
 * Ensure that SQLite is initialized.
 *
 * @param logger - An optional logger to pass to the Sqlite constructor.
 * @returns The SQLite database object.
 */
async function initDB(
  logger?: ReturnType<typeof makeLogger>,
): Promise<Sqlite.Database> {
  console.log('dbPath:', dbPath);
  return new Sqlite(dbPath, {
    verbose: (logger ?? console).info,
  });
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
  const db = await initDB(logger);

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

  /**
   * Read a key's value from the database.
   *
   * @param key - A key to fetch.
   * @param required - True if it is an error for the entry not to be there.
   * @returns The value at that key.
   */
  function kvGet(key: string, required: boolean): string {
    const result = sqlKVGet.get(key);
    if (isObject(result) && hasProperty(result, 'value')) {
      const value = result.value as string;
      logger.debug(`kernel get '${key}' as '${value}'`);
      return value;
    }
    if (required) {
      throw Error(`no record matching key '${key}'`);
    }
    // Sometimes, we really lean on TypeScript's unsoundness
    return undefined as unknown as string;
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
    logger.debug(`kernel delete '${key}'`);
    sqlKVDelete.run(key);
  }

  const sqlKVDrop = db.prepare(`
    DROP TABLE kv
  `);

  /**
   * Delete all keys and values from the database.
   */
  function kvTruncate(): void {
    logger.debug(`kernel truncate`);
    sqlKVDrop.run();
    sqlKVInit.run();
  }

  return {
    get: (key) => kvGet(key, false),
    getRequired: (key) => kvGet(key, true),
    set: kvSet,
    delete: kvDelete,
    truncate: db.transaction(kvTruncate),
  };
}
