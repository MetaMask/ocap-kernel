import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SQL_QUERIES } from './common.ts';
import { getDBFolder } from './env.ts';
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _inTx: false,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _spStack: [] as string[],
};
const OpfsDbMock = vi.fn(() => mockDb);
const DBMock = vi.fn(() => mockDb);
vi.mock('@sqlite.org/sqlite-wasm', () => ({
  default: vi.fn(async () => ({
    oo1: {
      OpfsDb: OpfsDbMock,
      DB: DBMock,
    },
  })),
}));

vi.mock('./env.ts', () => ({
  getDBFolder: vi.fn(() => 'test-folder'),
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
    expect(data).toStrictEqual([...mockKVDataForMap]);
  });

  it('vatStore.updateKVData updates the database', async () => {
    const db = await makeSQLKernelDatabase({});
    const vatStore = db.makeVatStore('vvat');
    vatStore.updateKVData([...mockKVDataForMap], ['del1', 'del2']);
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

  describe('initialization options', () => {
    it('should use custom dbFilename when provided', async () => {
      const customFilename = 'custom.db';
      await makeSQLKernelDatabase({ dbFilename: customFilename });
      expect(mockDb.exec).toHaveBeenCalledWith(SQL_QUERIES.CREATE_TABLE);
    });

    it('should use custom label in logs', async () => {
      const customLabel = '[custom-store]';
      const db = await makeSQLKernelDatabase({
        label: customLabel,
        verbose: true,
      });
      const store = db.kernelKVStore;
      mockStatement.step.mockReturnValueOnce(false);
      expect(() => store.getRequired('missing-key')).toThrow(
        `[${customLabel}] no record matching key 'missing-key'`,
      );
    });

    it('should handle verbose logging', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      await makeSQLKernelDatabase({ verbose: true });
      expect(consoleSpy).toHaveBeenCalledWith(
        ['[sqlite]'],
        'Initializing kernel store',
      );
    });
  });

  describe('database path construction', () => {
    beforeEach(() => {
      vi.mocked(getDBFolder).mockClear();
    });

    it('should preserve special filenames starting with ":"', async () => {
      await makeSQLKernelDatabase({ dbFilename: ':memory:' });
      expect(getDBFolder).not.toHaveBeenCalled();
      expect(OpfsDbMock).toHaveBeenCalledWith(':memory:', 'cw');
      expect(mockDb.exec).toHaveBeenCalledWith(SQL_QUERIES.CREATE_TABLE);
    });

    it('should construct proper path with folder for regular filenames', async () => {
      const regularFilename = 'test.db';
      await makeSQLKernelDatabase({ dbFilename: regularFilename });
      expect(getDBFolder).toHaveBeenCalled();
      expect(OpfsDbMock).toHaveBeenCalledWith(
        `ocap-test-folder-${regularFilename}`,
        'cw',
      );
      expect(mockDb.exec).toHaveBeenCalledWith(SQL_QUERIES.CREATE_TABLE);
    });

    it('should handle empty folder path', async () => {
      vi.mocked(getDBFolder).mockReturnValueOnce('');
      const regularFilename = 'test.db';
      await makeSQLKernelDatabase({ dbFilename: regularFilename });
      expect(getDBFolder).toHaveBeenCalled();
      expect(OpfsDbMock).toHaveBeenCalledWith(`ocap-${regularFilename}`, 'cw');
      expect(mockDb.exec).toHaveBeenCalledWith(SQL_QUERIES.CREATE_TABLE);
    });
  });

  describe('error handling', () => {
    it('should handle SQL execution errors', async () => {
      const db = await makeSQLKernelDatabase({});
      mockStatement.step.mockImplementationOnce(() => {
        throw new Error('SQL execution error');
      });
      expect(() => db.executeQuery('SELECT * FROM invalid_table')).toThrow(
        'SQL execution error',
      );
      expect(mockStatement.reset).toHaveBeenCalled();
    });
  });

  describe('savepoint functionality', () => {
    beforeEach(() => {
      mockDb.exec.mockClear();
      mockDb._inTx = false;
      mockDb._spStack = [];
    });

    it('creates a savepoint using sanitized name', async () => {
      const db = await makeSQLKernelDatabase({});
      db.createSavepoint('valid_name');

      expect(mockDb.exec).toHaveBeenCalledWith('SAVEPOINT valid_name');
    });

    it('rejects invalid savepoint names', async () => {
      const db = await makeSQLKernelDatabase({});
      expect(() => db.createSavepoint('invalid-name')).toThrow(
        'Invalid identifier',
      );
      expect(() => db.createSavepoint('123numeric')).toThrow(
        'Invalid identifier',
      );
      expect(() => db.createSavepoint('spaces not allowed')).toThrow(
        'Invalid identifier',
      );
      expect(() => db.createSavepoint("point'; DROP TABLE kv--")).toThrow(
        'Invalid identifier',
      );
      expect(mockDb.exec).not.toHaveBeenCalledWith(
        expect.stringContaining('DROP TABLE'),
      );
    });

    it('rolls back to a savepoint', async () => {
      const db = await makeSQLKernelDatabase({});
      db.createSavepoint('test_point');
      db.rollbackSavepoint('test_point');
      expect(mockDb.exec).toHaveBeenCalledWith(
        'ROLLBACK TO SAVEPOINT test_point',
      );
    });

    it('releases a savepoint', async () => {
      const db = await makeSQLKernelDatabase({});
      db.createSavepoint('test_point');
      db.releaseSavepoint('test_point');
      expect(mockDb.exec).toHaveBeenCalledWith('RELEASE SAVEPOINT test_point');
    });

    it('createSavepoint begins transaction if needed', async () => {
      const db = await makeSQLKernelDatabase({});
      db.createSavepoint('test_point');
      expect(mockDb._inTx).toBe(true);
      expect(mockDb._spStack).toContain('test_point');
      expect(mockDb.exec).toHaveBeenCalledWith('SAVEPOINT test_point');
    });

    it('rollbackSavepoint validates savepoint exists', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb._inTx = true;
      mockDb._spStack = ['existing_point'];
      expect(() => db.rollbackSavepoint('nonexistent_point')).toThrow(
        'No such savepoint: nonexistent_point',
      );
    });

    it('rollbackSavepoint removes all points after target', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb._inTx = true;
      mockDb._spStack = ['point1', 'point2', 'point3'];
      db.rollbackSavepoint('point2');
      expect(mockDb._spStack).toStrictEqual(['point1']);
      expect(mockDb.exec).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT point2');
    });

    it('rollbackSavepoint closes transaction if no savepoints remain', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb._inTx = true;
      mockDb._spStack = ['point1'];
      db.rollbackSavepoint('point1');
      expect(mockDb._spStack).toStrictEqual([]);
      expect(mockDb._inTx).toBe(false);
    });

    it('releaseSavepoint validates savepoint exists', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb._inTx = true;
      mockDb._spStack = ['existing_point'];
      expect(() => db.releaseSavepoint('nonexistent_point')).toThrow(
        'No such savepoint: nonexistent_point',
      );
    });

    it('releaseSavepoint removes all points after target', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb._inTx = true;
      mockDb._spStack = ['point1', 'point2', 'point3'];
      db.releaseSavepoint('point2');
      expect(mockDb._spStack).toStrictEqual(['point1']);
      expect(mockDb.exec).toHaveBeenCalledWith('RELEASE SAVEPOINT point2');
    });

    it('releaseSavepoint commits transaction if no savepoints remain', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb._inTx = true;
      mockDb._spStack = ['point1'];
      db.releaseSavepoint('point1');
      expect(mockDb._spStack).toStrictEqual([]);
      expect(mockDb._inTx).toBe(false);
    });

    it('supports nested savepoints', async () => {
      const db = await makeSQLKernelDatabase({});
      db.createSavepoint('outer');
      db.createSavepoint('inner');
      expect(mockDb._spStack).toStrictEqual(['outer', 'inner']);
      db.rollbackSavepoint('inner');
      expect(mockDb._spStack).toStrictEqual(['outer']);
      expect(mockDb._inTx).toBe(true);
      db.releaseSavepoint('outer');
      expect(mockDb._spStack).toStrictEqual([]);
      expect(mockDb._inTx).toBe(false);
    });
  });

  it('deleteVatStore removes all data for a given vat', async () => {
    Object.values(mockStatement).forEach((mock) => {
      if (typeof mock === 'function' && mock.mockReset) {
        mock.mockReset();
      }
    });
    const db = await makeSQLKernelDatabase({});
    const vatId = 'test-vat';
    db.deleteVatStore(vatId);
    expect(mockDb.prepare).toHaveBeenCalledWith(SQL_QUERIES.DELETE_VS_ALL);
    expect(mockStatement.bind).toHaveBeenCalledWith([vatId]);
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  it('deleteVatStore handles errors correctly', async () => {
    Object.values(mockStatement).forEach((mock) => {
      if (typeof mock === 'function' && mock.mockReset) {
        mock.mockReset();
      }
    });
    mockStatement.step.mockImplementationOnce(() => {
      throw new Error('Database error');
    });
    const db = await makeSQLKernelDatabase({});
    expect(() => db.deleteVatStore('test-vat')).toThrow('Database error');
    expect(mockStatement.bind).toHaveBeenCalled();
    expect(mockStatement.reset).not.toHaveBeenCalled();
  });

  it('deleteVatStore handles empty vatId correctly', async () => {
    Object.values(mockStatement).forEach((mock) => {
      if (typeof mock === 'function' && mock.mockReset) {
        mock.mockReset();
      }
    });

    const db = await makeSQLKernelDatabase({});
    db.deleteVatStore('');
    expect(mockStatement.bind).toHaveBeenCalledWith(['']);
    expect(mockStatement.step).toHaveBeenCalled();
    expect(mockStatement.reset).toHaveBeenCalled();
  });

  it("deleteVatStore doesn't affect other vat stores", async () => {
    Object.values(mockStatement).forEach((mock) => {
      if (typeof mock === 'function' && mock.mockReset) {
        mock.mockReset();
      }
    });

    const db = await makeSQLKernelDatabase({});
    db.makeVatStore('vat1');
    const vatStore2 = db.makeVatStore('vat2');
    db.deleteVatStore('vat1');
    mockStatement.step.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockStatement.getString
      .mockReturnValueOnce('testKey')
      .mockReturnValueOnce('testValue');

    const data = vatStore2.getKVData();
    expect(mockStatement.bind).toHaveBeenCalledWith(['vat2']);
    expect(data).toStrictEqual([['testKey', 'testValue']]);
  });
});

describe('transaction management', () => {
  beforeEach(() => {
    Object.values(mockStatement).forEach((mock) => {
      if (typeof mock === 'function' && mock.mockReset) {
        mock.mockReset();
      }
    });
    mockDb.exec.mockReset();
    mockDb._inTx = false;
    mockDb._spStack = [];
  });

  it('safeMutate rollbacks transaction on error', async () => {
    const db = await makeSQLKernelDatabase({});
    mockDb._inTx = false;
    mockDb._spStack = [];
    mockStatement.step.mockImplementationOnce(() => {
      throw new Error('Database error');
    });
    const vatStore = db.makeVatStore('test-vat');
    expect(() => vatStore.updateKVData([['key', 'value']], [])).toThrow(
      'Database error',
    );
    expect(mockStatement.step).toHaveBeenCalled();
  });

  it('safeMutate does not commit if already in transaction', async () => {
    const db = await makeSQLKernelDatabase({});
    mockDb._inTx = true;
    mockDb._spStack = [];
    const vatStore = db.makeVatStore('test-vat');
    vatStore.updateKVData([['key', 'value']], []);
    expect(mockStatement.step).not.toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'BEGIN TRANSACTION' }),
    );
    expect(mockStatement.step).not.toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'COMMIT TRANSACTION' }),
    );
  });
});
