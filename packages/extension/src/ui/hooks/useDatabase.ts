import { stringify } from '@metamask/kernel-utils';
import { hasProperty } from '@metamask/utils';
import { useCallback } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';

/**
 * Hook for database actions.
 *
 * @returns Database methods.
 */
export function useDatabase(): {
  fetchTables: () => Promise<string[]>;
  fetchTableData: (tableName: string) => Promise<Record<string, string>[]>;
  executeQuery: (sql: string) => Promise<Record<string, string>[]>;
} {
  const { callKernelMethod, logMessage } = usePanelContext();

  // Execute a query and set the result as table data
  const executeQuery = useCallback(
    async (sql: string): Promise<Record<string, string>[]> => {
      const result = await callKernelMethod({
        method: 'executeDBQuery',
        params: { sql },
      });
      if (hasProperty(result, 'error')) {
        throw new Error(stringify(result.error, 0));
      }
      logMessage(stringify(result, 0), 'received');
      return result;
    },
    [logMessage, callKernelMethod],
  );

  // Fetch available tables
  const fetchTables = useCallback(async (): Promise<string[]> => {
    const result = await callKernelMethod({
      method: 'executeDBQuery',
      params: { sql: "SELECT name FROM sqlite_master WHERE type='table'" },
    });
    if (hasProperty(result, 'error')) {
      throw new Error(stringify(result.error, 0));
    }
    logMessage(stringify(result, 0), 'received');
    return result
      .map((row: Record<string, string>) => row.name)
      .filter((name): name is string => name !== undefined);
  }, [logMessage, callKernelMethod]);

  // Fetch data for selected table
  const fetchTableData = useCallback(
    async (tableName: string): Promise<Record<string, string>[]> => {
      const result = await callKernelMethod({
        method: 'executeDBQuery',
        params: { sql: `SELECT * FROM ${tableName}` },
      });
      if (hasProperty(result, 'error')) {
        throw new Error(stringify(result.error, 0));
      }
      logMessage(stringify(result, 0), 'received');
      return result;
    },
    [logMessage, callKernelMethod],
  );

  return {
    fetchTables,
    fetchTableData,
    executeQuery,
  };
}
