import { stringify } from '@metamask/kernel-utils';
import { hasProperty } from '@metamask/utils';
import { useCallback } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';
import { parseObjectRegistry } from '../services/db-parser.ts';

/**
 * Hook for database actions.
 *
 * @returns Database methods.
 */
export function useDatabase(): {
  fetchTables: () => Promise<string[]>;
  fetchTableData: (tableName: string) => Promise<Record<string, string>[]>;
  executeQuery: (sql: string) => Promise<Record<string, string>[]>;
  fetchObjectRegistry: () => void;
} {
  const { callKernelMethod, logMessage, setObjectRegistry } = usePanelContext();

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

  // Fetch the kv db and parse it into an object registry
  const fetchObjectRegistry = useCallback((): void => {
    executeQuery('SELECT key, value FROM kv')
      .then((result) => {
        const parsedData = parseObjectRegistry(
          result as { key: string; value: string }[],
        );
        return setObjectRegistry(parsedData);
      })
      .catch((error: Error) =>
        logMessage(
          `Failed to fetch object registry: ${error.message}`,
          'error',
        ),
      );
  }, [executeQuery, logMessage, setObjectRegistry]);

  return {
    fetchTables,
    fetchTableData,
    executeQuery,
    fetchObjectRegistry,
  };
}
