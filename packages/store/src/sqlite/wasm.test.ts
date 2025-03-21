import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SQL_QUERIES } from './common.ts';
import { makeSQLKernelDatabase } from './wasm.ts';

const mockKVData = [
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2' },
] as const;

const mockKVDataForMap: [string, string][] = [
  ['key1', 'value1'],
  ['key2', 'value2'],
];

const mockStatement = {
  bind: vi.fn(),
  step: vi.fn(),
  getString: vi.fn(),
  reset: vi.fn(),
  get: vi.fn(),
  getColumnName: vi.fn(),
  columnCount: 2,
};

const mockDb = {
  exec: vi.fn(),
  prepare: vi.fn(() => mockStatement),
};

vi.mock('@sqlite.org/sqlite-wasm', () => ({
  default: vi.fn(async () => ({
    oo1: {
      OpfsDb: vi.fn(() => mockDb),
      DB: vi.fn(() => mockDb),
    },
  })),
}));

describe('makeSQLKernelDatabase', () => {
  beforeEach(() => {
    Object.values(mockStatement)
      .filter(
        (value): value is ReturnType<typeof vi.fn> =>
          typeof value === 'function',
      )
      .forEach((mockFn) => mockFn.mockReset());
  });

  it('initializes with OPFS when available', async () => {
    await makeSQLKernelDatabase({});
    expect(mockDb.exec).toHaveBeenCalledWith(SQL_QUERIES.CREATE_TABLE);
  });

  it('falls back to in-memory when OPFS is not available', async () => {
    vi.mocked(
      await import('@sqlite.org/sqlite-wasm'),
    ).default.mockImplementationOnce(
      async () =>
        ({
          oo1: {
            OpfsDb: undefined,
            DB: vi.fn(() => mockDb),
          },
        }) as unknown as Sqlite3Static,
    );
    const consoleSpy = vi.spyOn(console, 'warn');
    await makeSQLKernelDatabase({});
    expect(consoleSpy).toHaveBeenCalledWith(
      'OPFS not enabled, database will be ephemeral',
    );
    expect(mockDb.exec).toHaveBeenCalledWith(SQL_QUERIES.CREATE_TABLE);
  });

  it('get retrieves a value by key', async () => {
    const mockValue = 'test-value';
    mockStatement.step.mockReturnValueOnce(true);
    mockStatement.getString.mockReturnValueOnce(mockValue);
    const db = await makeSQLKernelDatabase({});
    const store = db.kernelKVStore;
    const result = store.get('test-key');
    expect(result).toBe(mockValue);
    expect(mockStatement.bind).toHaveBeenCalledWith(['test-key']);
  });

  it('getRequired throws when key not found', async () => {
    mockStatement.step.mockReturnValueOnce(false);
    const db = await makeSQLKernelDatabase({});
    const store = db.kernelKVStore;
    expect(() => store.getRequired('missing-key')).toThrow(
      "no record matching key 'missing-key'",
    );
  });

  it('set inserts or updates a value', async () => {
    const db = await makeSQLKernelDatabase({});
    const store = db.kernelKVStore;
    store.set('test-key', 'test-value');
    expect(mockStatement.bind).toHaveBeenCalledWith(['test-key', 'test-value']);
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  it('delete removes a key-value pair', async () => {
    const db = await makeSQLKernelDatabase({});
    const store = db.kernelKVStore;
    store.delete('test-key');
    expect(mockStatement.bind).toHaveBeenCalledWith(['test-key']);
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  it('clear removes all entries', async () => {
    const store = await makeSQLKernelDatabase({});
    store.clear();
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  it('getNextKey returns the next key in sequence', async () => {
    const mockNextKey = 'next-key';
    mockStatement.step.mockReturnValueOnce(true);
    mockStatement.getString.mockReturnValueOnce(mockNextKey);
    const db = await makeSQLKernelDatabase({});
    const store = db.kernelKVStore;
    const result = store.getNextKey('current-key');
    expect(result).toBe(mockNextKey);
    expect(mockStatement.bind).toHaveBeenCalledWith(['current-key']);
  });

  it('makeVatStore returns a VatStore', async () => {
    const db = await makeSQLKernelDatabase({});
    const vatStore = db.makeVatStore('vvat');
    expect(Object.keys(vatStore).sort()).toStrictEqual([
      'getKVData',
      'updateKVData',
    ]);
  });

  it('vatStore.getKVData returns a map of the data', async () => {
    const db = await makeSQLKernelDatabase({});
    const vatStore = db.makeVatStore('vvat');
    mockStatement.step
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    mockStatement.getString
      .mockReturnValueOnce(mockKVData[0].key)
      .mockReturnValueOnce(mockKVData[0].value)
      .mockReturnValueOnce(mockKVData[1].key)
      .mockReturnValueOnce(mockKVData[1].value);
    const data = vatStore.getKVData();
    expect(data).toStrictEqual(new Map(mockKVDataForMap));
  });

  it('vatStore.updateKVData updates the database', async () => {
    const db = await makeSQLKernelDatabase({});
    const vatStore = db.makeVatStore('vvat');
    vatStore.updateKVData(new Map(mockKVDataForMap), new Set(['del1', 'del2']));
    // begin transaction
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
    // set
    expect(mockStatement.bind).toHaveBeenCalledWith(['vvat', 'key1', 'value1']);
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
    // set
    expect(mockStatement.bind).toHaveBeenCalledWith(['vvat', 'key2', 'value2']);
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
    // delete
    expect(mockStatement.bind).toHaveBeenCalledWith(['vvat', 'del1']);
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
    // delete
    expect(mockStatement.bind).toHaveBeenCalledWith(['vvat', 'del2']);
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
    // commit transaction
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  it('executeQuery executes arbitrary SQL queries', async () => {
    mockStatement.step
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    mockStatement.getColumnName
      .mockReturnValueOnce('id')
      .mockReturnValueOnce('value')
      .mockReturnValueOnce('id')
      .mockReturnValueOnce('value');
    mockStatement.get
      .mockReturnValueOnce('1')
      .mockReturnValueOnce('first')
      .mockReturnValueOnce('2')
      .mockReturnValueOnce('second');
    const store = await makeSQLKernelDatabase({});
    const results = store.executeQuery('SELECT * FROM kv');
    expect(results).toStrictEqual([
      { id: '1', value: 'first' },
      { id: '2', value: 'second' },
    ]);
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  it('get returns undefined when step() returns false', async () => {
    mockStatement.step.mockReturnValueOnce(false);
    const db = await makeSQLKernelDatabase({});
    const store = db.kernelKVStore;
    const result = store.get('test-key');
    expect(result).toBeUndefined();
    expect(mockStatement.bind).toHaveBeenCalledWith(['test-key']);
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  it('get returns undefined when getString() returns falsy value', async () => {
    mockStatement.step.mockReturnValueOnce(true);
    mockStatement.getString.mockReturnValueOnce('');
    const db = await makeSQLKernelDatabase({});
    const store = db.kernelKVStore;
    const result = store.get('test-key');
    expect(result).toBeUndefined();
    expect(mockStatement.bind).toHaveBeenCalledWith(['test-key']);
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  it('executeQuery skips columns with null/undefined names', async () => {
    mockStatement.step.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockStatement.getColumnName
      .mockReturnValueOnce('id')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(undefined);
    mockStatement.get
      .mockReturnValueOnce('1')
      .mockReturnValueOnce('ignored')
      .mockReturnValueOnce('also-ignored');
    const store = await makeSQLKernelDatabase({});
    const results = store.executeQuery('SELECT * FROM kv');
    expect(results).toStrictEqual([{ id: '1' }]);
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  it('executeQuery handles non-string values by converting them to strings', async () => {
    mockStatement.step.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockStatement.getColumnName
      .mockReturnValueOnce('id')
      .mockReturnValueOnce('number');
    mockStatement.get.mockReturnValueOnce('1').mockReturnValueOnce(42);
    const store = await makeSQLKernelDatabase({});
    const results = store.executeQuery('SELECT * FROM kv');
    expect(results).toStrictEqual([
      {
        id: '1',
        number: '42',
      },
    ]);
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  describe('KVStore operations', () => {
    it('getNextKey returns undefined when no next key exists', async () => {
      mockStatement.step.mockReturnValueOnce(false);
      const db = await makeSQLKernelDatabase({});
      const store = db.kernelKVStore;
      const result = store.getNextKey('last-key');
      expect(result).toBeUndefined();
      expect(mockStatement.bind).toHaveBeenCalledWith(['last-key']);
      expect(mockStatement.reset).toHaveBeenCalled();
    });

    it('getNextKey returns undefined when getString returns falsy', async () => {
      mockStatement.step.mockReturnValueOnce(true);
      mockStatement.getString.mockReturnValueOnce('');
      const db = await makeSQLKernelDatabase({});
      const store = db.kernelKVStore;
      const result = store.getNextKey('current-key');
      expect(result).toBeUndefined();
      expect(mockStatement.bind).toHaveBeenCalledWith(['current-key']);
      expect(mockStatement.reset).toHaveBeenCalled();
    });
  });
});
