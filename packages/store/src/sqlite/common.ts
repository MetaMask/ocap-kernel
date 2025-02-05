export const SQL_QUERIES = {
  CREATE_TABLE: `
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT,
      value TEXT,
      PRIMARY KEY(key)
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
  SET: `
    INSERT INTO kv (key, value)
    VALUES (?, ?)
    ON CONFLICT DO UPDATE SET value = excluded.value
  `,
  DELETE: `
    DELETE FROM kv
    WHERE key = ?
  `,
  CLEAR: `
    DELETE FROM kv
  `,
  DROP: `
    DROP TABLE kv
  `,
} as const;
