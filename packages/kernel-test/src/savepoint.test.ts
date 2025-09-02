import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { describe, it, expect, vi } from 'vitest';

/**
 * Helper to create a test database with some initial data
 *
 * @returns A SQLite database instance with initial data
 */
async function setupTestDb() {
  const db = await makeSQLKernelDatabase({
    dbFilename: ':memory:',
  });
  const { kernelKVStore } = db;
  kernelKVStore.set('key1', 'value1');
  kernelKVStore.set('key2', 'value2');
  return db;
}

describe('Savepoint functionality', () => {
  it('allows creating and releasing a savepoint', async () => {
    const db = await setupTestDb();
    db.createSavepoint('test_point');
    db.kernelKVStore.set('key3', 'value3');
    db.releaseSavepoint('test_point');
    expect(db.kernelKVStore.get('key3')).toBe('value3');
  });

  it('can rollback to a savepoint to undo changes', async () => {
    const db = await setupTestDb();
    expect(db.kernelKVStore.get('key1')).toBe('value1');
    expect(db.kernelKVStore.get('key2')).toBe('value2');
    db.createSavepoint('test_point');
    db.kernelKVStore.set('key1', 'modified1');
    db.kernelKVStore.set('key3', 'value3');
    db.kernelKVStore.delete('key2');
    expect(db.kernelKVStore.get('key1')).toBe('modified1');
    expect(db.kernelKVStore.get('key2')).toBeUndefined();
    expect(db.kernelKVStore.get('key3')).toBe('value3');
    db.rollbackSavepoint('test_point');
    expect(db.kernelKVStore.get('key1')).toBe('value1');
    expect(db.kernelKVStore.get('key2')).toBe('value2');
    expect(db.kernelKVStore.get('key3')).toBeUndefined();
  });

  it('supports nested savepoints', async () => {
    const db = await setupTestDb();
    db.createSavepoint('outer');
    db.kernelKVStore.set('key3', 'value3');
    db.createSavepoint('inner');
    db.kernelKVStore.set('key4', 'value4');
    expect(db.kernelKVStore.get('key3')).toBe('value3');
    expect(db.kernelKVStore.get('key4')).toBe('value4');
    db.rollbackSavepoint('inner');
    expect(db.kernelKVStore.get('key3')).toBe('value3');
    expect(db.kernelKVStore.get('key4')).toBeUndefined();
    db.releaseSavepoint('outer');
    expect(db.kernelKVStore.get('key3')).toBe('value3');
  });

  it('rejects invalid savepoint names', async () => {
    const db = await setupTestDb();
    expect(() => db.createSavepoint('invalid-name')).toThrow(
      'Invalid identifier',
    );
    expect(() => db.createSavepoint('123numeric')).toThrow(
      'Invalid identifier',
    );
    expect(() => db.createSavepoint('spaces not allowed')).toThrow(
      'Invalid identifier',
    );
  });

  it('sanitizes savepoint names to prevent SQL injection', async () => {
    const db = await setupTestDb();
    const executeQuerySpy = vi.spyOn(db, 'executeQuery');
    expect(() => db.createSavepoint("point'; DROP TABLE kv--")).toThrow(
      'Invalid identifier',
    );
    expect(executeQuerySpy).not.toHaveBeenCalled();
  });
});
