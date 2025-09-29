import { mkdir } from 'node:fs/promises';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SQL_QUERIES } from './common.ts';
import { makeSQLKernelDatabase, getDBFilename } from './nodejs.ts';

const mockKVData = [
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2' },
];

const mockKVDataForMap: [string, string][] = [
  ['key1', 'value1'],
  ['key2', 'value2'],
];

const mockStatement = {
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
  pluck: vi.fn(),
  iterate: vi.fn(() => mockKVData),
};

const mockDb = {
  prepare: vi.fn(() => mockStatement),
  transaction: vi.fn((fn) => fn),
  exec: vi.fn(),
  inTransaction: false,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _spStack: [] as string[],
};

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => mockDb),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
}));

vi.mock('node:os', () => ({
  tmpdir: vi.fn(() => '/mock-tmpdir'),
}));

describe('makeSQLKernelDatabase', () => {
  const mockMkdir = vi.mocked(mkdir).mockResolvedValue('');

  beforeEach(() => {
    Object.values(mockStatement).forEach((mock) => mock.mockReset());
  });

  it('creates kv table', async () => {
    await makeSQLKernelDatabase({});
    expect(mockDb.prepare).toHaveBeenCalledWith(SQL_QUERIES.CREATE_TABLE);
    expect(mockDb.prepare).toHaveBeenCalledWith(SQL_QUERIES.CREATE_TABLE_VS);
  });

  it('get retrieves a value by key', async () => {
    const mockValue = 'test-value';
    mockStatement.get.mockReturnValue(mockValue);
    const db = await makeSQLKernelDatabase({});
    const store = db.kernelKVStore;
    const result = store.get('test-key');
    expect(result).toBe(mockValue);
    expect(mockStatement.get).toHaveBeenCalledWith('test-key');
  });

  it('getRequired throws when key not found', async () => {
    mockStatement.get.mockReturnValue(undefined);
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
    expect(mockStatement.run).toHaveBeenCalledWith('test-key', 'test-value');
  });

  it('delete removes a key-value pair', async () => {
    const db = await makeSQLKernelDatabase({});
    const store = db.kernelKVStore;
    store.delete('test-key');
    expect(mockStatement.run).toHaveBeenCalledWith('test-key');
  });

  it('clear drops and recreates the table', async () => {
    const store = await makeSQLKernelDatabase({});
    store.clear();
    expect(mockStatement.run).toHaveBeenCalledTimes(4);
  });

  it('executeQuery runs arbitrary SQL queries', async () => {
    const mockResults = [{ key: 'value' }];
    mockStatement.all.mockReturnValue(mockResults);
    const store = await makeSQLKernelDatabase({});
    const result = store.executeQuery('SELECT * FROM kv');
    expect(result).toStrictEqual(mockResults);
  });

  it('getNextKey returns the next key in sequence', async () => {
    const mockNextKey = 'next-key';
    mockStatement.get.mockReturnValue(mockNextKey);
    const db = await makeSQLKernelDatabase({});
    const store = db.kernelKVStore;
    const result = store.getNextKey('current-key');
    expect(result).toBe(mockNextKey);
    expect(mockStatement.get).toHaveBeenCalledWith('current-key');
  });

  it('makeVatStore returns a VatStore', async () => {
    const db = await makeSQLKernelDatabase({});
    const vatStore = db.makeVatStore('vvat');
    expect(Object.keys(vatStore).sort()).toStrictEqual([
      'getKVData',
      'updateKVData',
    ]);
  });

  it('vatStore.getKVData returns the data', async () => {
    const db = await makeSQLKernelDatabase({});
    const vatStore = db.makeVatStore('vvat');
    const data = vatStore.getKVData();
    expect(data).toStrictEqual([...mockKVDataForMap]);
  });

  it('vatStore.updateKVData updates the database', async () => {
    const db = await makeSQLKernelDatabase({});
    const vatStore = db.makeVatStore('vvat');
    vatStore.updateKVData([...mockKVDataForMap], ['del1', 'del2']);
    expect(mockStatement.run).toHaveBeenCalled(); // begin transaction
    expect(mockStatement.run).toHaveBeenCalledWith('vvat', 'key1', 'value1'); // set
    expect(mockStatement.run).toHaveBeenCalledWith('vvat', 'key2', 'value2'); // set
    expect(mockStatement.run).toHaveBeenCalledWith('vvat', 'del1'); // delete
    expect(mockStatement.run).toHaveBeenCalledWith('vvat', 'del2'); // delete
    expect(mockStatement.run).toHaveBeenCalled(); // commit transaction
  });

  describe('deleteVatStore functionality', () => {
    beforeEach(() => {
      Object.values(mockStatement).forEach((mock) => mock.mockReset());
    });

    it('deleteVatStore removes all data for a given vat', async () => {
      const db = await makeSQLKernelDatabase({});
      const vatId = 'test-vat';
      db.deleteVatStore(vatId);
      expect(mockDb.prepare).toHaveBeenCalledWith(SQL_QUERIES.DELETE_VS_ALL);
      expect(mockStatement.run).toHaveBeenCalledWith(vatId);
    });

    it('deleteVatStore handles empty vatId correctly', async () => {
      const db = await makeSQLKernelDatabase({});
      db.deleteVatStore('');
      expect(mockStatement.run).toHaveBeenCalledWith('');
    });

    it("deleteVatStore doesn't affect other vat stores", async () => {
      const db = await makeSQLKernelDatabase({});
      db.makeVatStore('vat1');
      const vatStore2 = db.makeVatStore('vat2');
      db.deleteVatStore('vat1');
      mockStatement.iterate.mockReturnValueOnce([
        { key: 'testKey', value: 'testValue' },
      ]);
      const data = vatStore2.getKVData();
      expect(data).toStrictEqual([['testKey', 'testValue']]);
      expect(mockStatement.iterate).toHaveBeenCalledWith('vat2');
    });

    it('deleteVatStore handles errors correctly', async () => {
      const db = await makeSQLKernelDatabase({});
      mockStatement.run.mockImplementationOnce(() => {
        throw new Error('Database error during delete');
      });
      expect(() => db.deleteVatStore('test-vat')).toThrow(
        'Database error during delete',
      );
    });
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

  describe('savepoint functionality', () => {
    beforeEach(() => {
      mockDb.exec.mockClear();
      mockDb.inTransaction = false;
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
      expect(mockDb._spStack).toContain('test_point');
      expect(mockDb.exec).toHaveBeenCalledWith('SAVEPOINT test_point');
    });

    it('rollbackSavepoint validates savepoint exists', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb.inTransaction = true;
      mockDb._spStack = ['existing_point'];
      expect(() => db.rollbackSavepoint('nonexistent_point')).toThrow(
        'No such savepoint: nonexistent_point',
      );
    });

    it('rollbackSavepoint removes all points after target', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb.inTransaction = true;
      mockDb._spStack = ['point1', 'point2', 'point3'];
      db.rollbackSavepoint('point2');
      expect(mockDb._spStack).toStrictEqual(['point1']);
      expect(mockDb.exec).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT point2');
    });

    it('rollbackSavepoint closes transaction if no savepoints remain', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb.inTransaction = true;
      mockDb._spStack = ['point1'];
      db.rollbackSavepoint('point1');
      expect(mockDb._spStack).toStrictEqual([]);
    });

    it('releaseSavepoint validates savepoint exists', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb.inTransaction = true;
      mockDb._spStack = ['existing_point'];
      expect(() => db.releaseSavepoint('nonexistent_point')).toThrow(
        'No such savepoint: nonexistent_point',
      );
    });

    it('releaseSavepoint removes all points after target', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb.inTransaction = true;
      mockDb._spStack = ['point1', 'point2', 'point3'];
      db.releaseSavepoint('point2');
      expect(mockDb._spStack).toStrictEqual(['point1']);
      expect(mockDb.exec).toHaveBeenCalledWith('RELEASE SAVEPOINT point2');
    });

    it('releaseSavepoint commits transaction if no savepoints remain', async () => {
      const db = await makeSQLKernelDatabase({});
      mockDb.inTransaction = true;
      mockDb._spStack = ['point1'];
      db.releaseSavepoint('point1');
      expect(mockDb._spStack).toStrictEqual([]);
    });

    it('supports nested savepoints', async () => {
      const db = await makeSQLKernelDatabase({});
      db.createSavepoint('outer');
      db.createSavepoint('inner');
      expect(mockDb._spStack).toStrictEqual(['outer', 'inner']);
      db.rollbackSavepoint('inner');
      expect(mockDb._spStack).toStrictEqual(['outer']);
      db.releaseSavepoint('outer');
      expect(mockDb._spStack).toStrictEqual([]);
    });
  });
});
