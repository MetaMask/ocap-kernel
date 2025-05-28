import { describe, it, expect } from 'vitest';

import { SQL_QUERIES, assertSafeIdentifier } from './common.ts';

describe('SQL_QUERIES', () => {
  // XXX Is this test actually useful? It's basically testing that the source code matches itself.
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
      'ABORT_TRANSACTION',
      'BEGIN_IMMEDIATE_TRANSACTION',
      'BEGIN_TRANSACTION',
      'CLEAR',
      'CLEAR_VS',
      'COMMIT_TRANSACTION',
      'CREATE_SAVEPOINT',
      'CREATE_TABLE',
      'CREATE_TABLE_VS',
      'DELETE',
      'DELETE_VS',
      'DELETE_VS_ALL',
      'DROP',
      'DROP_VS',
      'GET',
      'GET_ALL_VS',
      'GET_NEXT',
      'RELEASE_SAVEPOINT',
      'ROLLBACK_SAVEPOINT',
      'SET',
      'SET_VS',
    ]);
  });
});

describe('assertSafeIdentifier', () => {
  it('accepts valid SQL identifiers', () => {
    expect(() => assertSafeIdentifier('valid')).not.toThrow();
    expect(() => assertSafeIdentifier('Valid')).not.toThrow();
    expect(() => assertSafeIdentifier('valid_name')).not.toThrow();
    expect(() => assertSafeIdentifier('valid_name_123')).not.toThrow();
    expect(() => assertSafeIdentifier('_leading_underscore')).not.toThrow();
  });

  it('rejects invalid SQL identifiers', () => {
    // Starting with a number
    expect(() => assertSafeIdentifier('123invalid')).toThrow(
      'Invalid identifier',
    );

    // Containing invalid characters
    expect(() => assertSafeIdentifier('invalid-name')).toThrow(
      'Invalid identifier',
    );
    expect(() => assertSafeIdentifier('invalid.name')).toThrow(
      'Invalid identifier',
    );
    expect(() => assertSafeIdentifier('invalid;name')).toThrow(
      'Invalid identifier',
    );
    expect(() => assertSafeIdentifier('invalid name')).toThrow(
      'Invalid identifier',
    );

    // Containing SQL injection attempts
    expect(() => assertSafeIdentifier("name'; DROP TABLE users--")).toThrow(
      'Invalid identifier',
    );
  });
});
