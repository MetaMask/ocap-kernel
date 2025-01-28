import '@ocap/test-utils/mock-endoify';
import type { Kernel, KVStore } from '@ocap/kernel';
import { describe, it, expect, vi } from 'vitest';

import { executeDBQueryHandler } from './execute-db-query.js';

describe('executeDBQueryHandler', () => {
  const mockKVStore = {
    executeQuery: vi.fn(() => 'test'),
  } as unknown as KVStore;

  const mockKernel = {} as unknown as Kernel;

  it('should have the correct method', () => {
    expect(executeDBQueryHandler.method).toBe('executeDBQuery');
  });

  it('should execute query and return result', async () => {
    const params = { sql: 'SELECT * FROM test' };
    const result = await executeDBQueryHandler.implementation(
      mockKernel,
      mockKVStore,
      params,
    );
    expect(mockKVStore.executeQuery).toHaveBeenCalledWith(params.sql);
    expect(result).toBe('test');
  });

  it('should propagate errors from executeQuery', async () => {
    const error = new Error('Query failed');
    vi.mocked(mockKVStore.executeQuery).mockRejectedValueOnce(error);
    const params = { sql: 'SELECT * FROM test' };
    await expect(
      executeDBQueryHandler.implementation(mockKernel, mockKVStore, params),
    ).rejects.toThrow(error);
  });
});
