export const SQL_QUERIES = {
  CREATE_TABLE: `
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT,
      value TEXT,
      PRIMARY KEY(key)
    )
  `,
  CREATE_TABLE_VS: `
    CREATE TABLE IF NOT EXISTS kv_vatstore (
      vatID TEXT,
      key TEXT,
      value TEXT,
      PRIMARY KEY(vatID, key)
    )
  `,
  GET: `
    SELECT value
    FROM kv
    WHERE key = ?
  `,
  GET_NEXT: `
    SELECT key
    FROM kv
    WHERE key > ?
    LIMIT 1
  `,
  GET_ALL_VS: `
    SELECT key, value
    FROM kv_vatstore
    WHERE vatID = ?
  `,
  SET: `
    INSERT INTO kv (key, value)
    VALUES (?, ?)
    ON CONFLICT DO UPDATE SET value = excluded.value
  `,
  SET_VS: `
    INSERT INTO kv_vatstore (vatID, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT DO UPDATE SET value = excluded.value
  `,
  DELETE: `
    DELETE FROM kv
    WHERE key = ?
  `,
  DELETE_VS: `
    DELETE FROM kv_vatstore
    WHERE vatID = ? AND key = ?
  `,
  DELETE_VS_ALL: `
    DELETE FROM kv_vatstore
    WHERE vatID = ?
  `,
  CLEAR: `DELETE FROM kv`,
  CLEAR_VS: `DELETE FROM kv_vatstore`,
  DROP: `DROP TABLE kv`,
  DROP_VS: `DROP TABLE kv_vatstore`,
  BEGIN_TRANSACTION: `BEGIN TRANSACTION`,
  BEGIN_IMMEDIATE_TRANSACTION: `BEGIN IMMEDIATE TRANSACTION`,
  COMMIT_TRANSACTION: `COMMIT TRANSACTION`,
  ABORT_TRANSACTION: `ROLLBACK TRANSACTION`,
  // SQLite's parameter markers (?, ?NNN, :name, @name, $name) can only be used
  // in places where a literal value is allowed. We can't bind identifiers
  // for table names, column names, or savepoint names. We use %NAME% as a
  // placeholder for the savepoint name.
  CREATE_SAVEPOINT: `SAVEPOINT %NAME%`,
  ROLLBACK_SAVEPOINT: `ROLLBACK TO SAVEPOINT %NAME%`,
  RELEASE_SAVEPOINT: `RELEASE SAVEPOINT %NAME%`,
} as const;

/**
 * The default filename for the SQLite database; ":memory:" is an ephemeral in-memory database.
 */
export const DEFAULT_DB_FILENAME = ':memory:';

/**
 * Check if a string is a valid SQLite identifier.
 *
 * @param name - The string to check.
 * @returns The string if it is a valid identifier.
 */
export function assertSafeIdentifier(name: string): string {
  if (!/^[A-Za-z_]\w*$/u.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return name;
}
