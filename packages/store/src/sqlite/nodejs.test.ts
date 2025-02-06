import { mkdir } from 'fs/promises';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SQL_QUERIES } from './common.js';
import { makeSQLKVStore, getDBFilename } from './nodejs.js';

const mockStatement = {
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
  pluck: vi.fn(),
};

const mockDb = {
  prepare: vi.fn(() => mockStatement),
  transaction: vi.fn((fn) => fn),
};

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => mockDb),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
}));

vi.mock('os', () => ({
  tmpdir: vi.fn(() => '/mock-tmpdir'),
}));

describe('makeSQLKVStore', () => {
  const mockMkdir = vi.mocked(mkdir).mockResolvedValue('');

  beforeEach(() => {
    Object.values(mockStatement).forEach((mock) => mock.mockReset());
  });

  it('creates kv table', async () => {
    await makeSQLKVStore();
    expect(mockDb.prepare).toHaveBeenCalledWith(SQL_QUERIES.CREATE_TABLE);
  });

  it('get retrieves a value by key', async () => {
    const mockValue = 'test-value';
    mockStatement.get.mockReturnValue(mockValue);
    const store = await makeSQLKVStore();
    const result = store.get('test-key');
    expect(result).toBe(mockValue);
    expect(mockStatement.get).toHaveBeenCalledWith('test-key');
  });

  it('getRequired throws when key not found', async () => {
    mockStatement.get.mockReturnValue(undefined);
    const store = await makeSQLKVStore();
    expect(() => store.getRequired('missing-key')).toThrow(
      "no record matching key 'missing-key'",
    );
  });

  it('set inserts or updates a value', async () => {
    const store = await makeSQLKVStore();
    store.set('test-key', 'test-value');
    expect(mockStatement.run).toHaveBeenCalledWith('test-key', 'test-value');
  });

  it('delete removes a key-value pair', async () => {
    const store = await makeSQLKVStore();
    store.delete('test-key');
    expect(mockStatement.run).toHaveBeenCalledWith('test-key');
  });

  it('clear drops and recreates the table', async () => {
    const store = await makeSQLKVStore();
    store.clear();
    expect(mockStatement.run).toHaveBeenCalledTimes(3);
  });

  it('executeQuery runs arbitrary SQL queries', async () => {
    const mockResults = [{ key: 'value' }];
    mockStatement.all.mockReturnValue(mockResults);
    const store = await makeSQLKVStore();
    const result = store.executeQuery('SELECT * FROM kv');
    expect(result).toStrictEqual(mockResults);
  });

  it('getNextKey returns the next key in sequence', async () => {
    const mockNextKey = 'next-key';
    mockStatement.get.mockReturnValue(mockNextKey);
    const store = await makeSQLKVStore();
    const result = store.getNextKey('current-key');
    expect(result).toBe(mockNextKey);
    expect(mockStatement.get).toHaveBeenCalledWith('current-key');
  });

  it('getNextKey throws if previousKey is not a string', async () => {
    const store = await makeSQLKVStore();
    // @ts-expect-error Testing invalid input
    expect(() => store.getNextKey(123)).toThrow('must be a string');
  });

  describe('getDBFilename', () => {
    it('returns in-memory database path when label starts with ":"', async () => {
      const result = await getDBFilename(':memory:');
      expect(result).toBe(':memory:');
    });

    it('creates file-based database path for normal labels with .db suffix', async () => {
      const result = await getDBFilename('test.db');
      expect(result).toBe('/mock-tmpdir/ocap-sqlite/test.db');
      expect(mockMkdir).toHaveBeenCalledWith('/mock-tmpdir/ocap-sqlite', {
        recursive: true,
      });
    });
  });
});
