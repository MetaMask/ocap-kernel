import { describe, it, expect, vi } from 'vitest';

import { executeDBQueryHandler } from './execute-db-query.ts';

describe('executeDBQueryHandler', () => {
  it('executes a database query', () => {
    const mockExecuteDBQuery = vi.fn().mockReturnValueOnce([{ key: 'value' }]);

    const result = executeDBQueryHandler.implementation(
      { executeDBQuery: mockExecuteDBQuery },
      {
        sql: 'test-query',
      },
    );

    expect(mockExecuteDBQuery).toHaveBeenCalledWith('test-query');
    expect(result).toStrictEqual([{ key: 'value' }]);
  });

  it('should propagate errors from executeDBQuery', () => {
    const error = new Error('Query failed');
    const mockExecuteDBQuery = vi.fn().mockImplementationOnce(() => {
      throw error;
    });

    // TODO:rekm Fix upstream types to allow sync handlers
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    expect(() =>
      executeDBQueryHandler.implementation(
        { executeDBQuery: mockExecuteDBQuery },
        { sql: 'test-query' },
      ),
    ).toThrow(error);
  });
});
