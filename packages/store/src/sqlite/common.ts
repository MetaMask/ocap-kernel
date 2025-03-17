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
  CLEAR: `
    DELETE FROM kv
  `,
  CLEAR_VS: `
    DELETE FROM kv_vatstore
  `,
  DROP: `
    DROP TABLE kv
  `,
  DROP_VS: `
    DROP TABLE kv_vatstore
  `,
  BEGIN_TRANSACTION: `
    BEGIN TRANSACTION
  `,
  COMMIT_TRANSACTION: `
    COMMIT TRANSACTION
  `,
  ABORT_TRANSACTION: `
    ROLLBACK TRANSACTION
  `,
} as const;
