import type { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';
import { describe, it, expect, vi } from 'vitest';

import { executeDBQueryHandler } from './execute-db-query.ts';

describe('executeDBQueryHandler', () => {
  const mockKernelDatabase = {
    executeQuery: vi.fn(() => 'test'),
  } as unknown as KernelDatabase;

  const mockKernel = {} as unknown as Kernel;

  it('should have the correct method', () => {
    expect(executeDBQueryHandler.method).toBe('executeDBQuery');
  });

  it('should execute query and return result', async () => {
    const params = { sql: 'SELECT * FROM test' };
    const result = await executeDBQueryHandler.implementation(
      mockKernel,
      mockKernelDatabase,
      params,
    );
    expect(mockKernelDatabase.executeQuery).toHaveBeenCalledWith(params.sql);
    expect(result).toBe('test');
  });

  it('should propagate errors from executeQuery', async () => {
    const error = new Error('Query failed');
    vi.mocked(mockKernelDatabase.executeQuery).mockRejectedValueOnce(error);
    const params = { sql: 'SELECT * FROM test' };
    await expect(
      executeDBQueryHandler.implementation(
        mockKernel,
        mockKernelDatabase,
        params,
      ),
    ).rejects.toThrow(error);
  });
});
