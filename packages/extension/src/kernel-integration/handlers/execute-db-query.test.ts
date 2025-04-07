import { describe, it, expect, vi } from 'vitest';

import { executeDBQueryHandler } from './execute-db-query.ts';

describe('executeDBQueryHandler', () => {
  it('executes a database query', async () => {
    const mockExecuteDBQuery = vi.fn().mockReturnValueOnce([{ key: 'value' }]);

    const result = await executeDBQueryHandler.implementation(
      { executeDBQuery: mockExecuteDBQuery },
      {
        sql: 'test-query',
      },
    );

    expect(mockExecuteDBQuery).toHaveBeenCalledWith('test-query');
    expect(result).toStrictEqual([{ key: 'value' }]);
  });

  it('should propagate errors from executeDBQuery', async () => {
    const error = new Error('Query failed');
    const mockExecuteDBQuery = vi.fn().mockImplementationOnce(() => {
      throw error;
    });

    await expect(
      executeDBQueryHandler.implementation(
        { executeDBQuery: mockExecuteDBQuery },
        { sql: 'test-query' },
      ),
    ).rejects.toThrow(error);
  });
});
