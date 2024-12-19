import { stringify } from '@ocap/utils';
import { useCallback, useEffect, useState } from 'react';

import { KernelControlMethod } from '../../kernel-integration/messages.js';
import { usePanelContext } from '../context/PanelContext.js';
import { isErrorResponse } from '../utils.js';

/**
 * Hook for the database inspector.
 *
 * @returns Database inspector state and actions.
 */
export function useDatabaseInspector(): {
  tables: string[];
  selectedTable: string;
  setSelectedTable: (table: string) => void;
  tableData: Record<string, string>[];
  refreshData: () => void;
  executeQuery: (sql: string) => void;
  queryResults: Record<string, string>[];
  queryError: string | null;
} {
  const { sendMessage, logMessage } = usePanelContext();
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableData, setTableData] = useState<Record<string, string>[]>([]);
  const [queryResults, setQueryResults] = useState<Record<string, string>[]>(
    [],
  );
  const [queryError, setQueryError] = useState<string | null>(null);

  // Execute a query and set the result as table data
  const executeQuery = useCallback(
    (sql: string): void => {
      setQueryError(null);
      sendMessage({
        method: KernelControlMethod.executeDBQuery,
        params: { sql },
      })
        .then((result) => {
          logMessage(stringify(result, 0), 'received');
          if (!isErrorResponse(result)) {
            setQueryResults(result);
          }
          return result;
        })
        .catch((error) => {
          setQueryError(`Failed to execute query: ${error}`);
        });
    },
    [logMessage, sendMessage],
  );

  // Fetch available tables
  const fetchTables = useCallback(async (): Promise<void> => {
    const result = await sendMessage({
      method: KernelControlMethod.executeDBQuery,
      params: { sql: "SELECT name FROM sqlite_master WHERE type='table'" },
    });
    if (!isErrorResponse(result)) {
      logMessage(stringify(result, 0), 'received');
      const tableNames = result
        .map((row: Record<string, string>) => row.name)
        .filter((name): name is string => name !== undefined);
      setTables(tableNames);
      if (tableNames.length > 0) {
        setSelectedTable(tableNames[0] ?? '');
      }
    }
  }, [logMessage, sendMessage]);

  // Fetch data for selected table
  const fetchTableData = useCallback(
    async (tableName: string): Promise<void> => {
      const result = await sendMessage({
        method: KernelControlMethod.executeDBQuery,
        params: { sql: `SELECT * FROM ${tableName}` },
      });
      if (!isErrorResponse(result)) {
        logMessage(stringify(result, 0), 'received');
        setTableData(result);
      }
    },
    [logMessage, sendMessage],
  );

  // Refresh data for selected table
  const refreshData = useCallback(() => {
    fetchTableData(selectedTable).catch((error) =>
      logMessage(
        `Failed to fetch data for table ${selectedTable}: ${error}`,
        'error',
      ),
    );
  }, [fetchTableData, logMessage, selectedTable]);

  // Load table data when selected table changes
  useEffect(() => {
    if (selectedTable) {
      refreshData();
    }
  }, [selectedTable, refreshData]);

  // Initial load of tables
  useEffect(() => {
    fetchTables().catch((error) =>
      logMessage(`Failed to fetch tables: ${error.message}`, 'error'),
    );
  }, [fetchTables, logMessage]);

  return {
    tables,
    selectedTable,
    setSelectedTable,
    tableData,
    refreshData,
    executeQuery,
    queryResults,
    queryError,
  };
}
