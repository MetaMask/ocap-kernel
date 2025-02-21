import { describe, it, expect } from 'vitest';

import { SQL_QUERIES } from './common.js';

describe('SQL_QUERIES', () => {
  it.each([
    [
      'CREATE_TABLE',
      'CREATE TABLE IF NOT EXISTS kv ( key TEXT, value TEXT, PRIMARY KEY(key) )',
      'creates a key-value table with proper schema',
    ],
    ['GET', 'SELECT value FROM kv WHERE key = ?', 'retrieves a value by key'],
    [
      'GET_NEXT',
      'SELECT key FROM kv WHERE key > ? LIMIT 1',
      'gets the next key in sequence',
    ],
    [
      'SET',
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT DO UPDATE SET value = excluded.value',
      'inserts or updates a key-value pair',
    ],
    [
      'DELETE',
      'DELETE FROM kv WHERE key = ?',
      'deletes a specific key-value pair',
    ],
    ['CLEAR', 'DELETE FROM kv', 'deletes all key-value pairs'],
    ['DROP', 'DROP TABLE kv', 'drops the entire table'],
  ] as const)(
    'has the expected %s query (%s)',
    (queryName, expectedSql, _description) => {
      expect(SQL_QUERIES[queryName].trim().replace(/\s+/gu, ' ')).toBe(
        expectedSql,
      );
    },
  );

  it('has all expected query properties', () => {
    expect(Object.keys(SQL_QUERIES).sort()).toStrictEqual([
      'CLEAR',
      'CREATE_TABLE',
      'DELETE',
      'DROP',
      'GET',
      'GET_NEXT',
      'SET',
    ]);
  });
});
