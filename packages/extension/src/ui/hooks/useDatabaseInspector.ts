import { hasProperty } from '@metamask/utils';
import { stringify } from '@ocap/utils';
import { useCallback, useEffect, useState } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';

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
} {
  const { callKernelMethod, logMessage } = usePanelContext();
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableData, setTableData] = useState<Record<string, string>[]>([]);

  // Execute a query and set the result as table data
  const executeQuery = useCallback(
    (sql: string): void => {
      callKernelMethod({
        method: 'executeDBQuery',
        params: { sql },
      })
        .then((result) => {
          logMessage(stringify(result, 0), 'received');
          if (!hasProperty(result, 'error')) {
            setTableData(result);
          }
          return result;
        })
        .catch((error) => {
          logMessage(`Failed to execute query: ${error}`, 'error');
        });
    },
    [logMessage, callKernelMethod],
  );

  // Fetch available tables
  const fetchTables = useCallback(async (): Promise<void> => {
    const result = await callKernelMethod({
      method: 'executeDBQuery',
      params: { sql: "SELECT name FROM sqlite_master WHERE type='table'" },
    });
    logMessage(stringify(result, 0), 'received');
    if (!hasProperty(result, 'error')) {
      const tableNames = result
        .map((row: Record<string, string>) => row.name)
        .filter((name): name is string => name !== undefined);
      setTables(tableNames);
      if (tableNames.length > 0) {
        setSelectedTable(tableNames[0] ?? '');
      }
    }
  }, [logMessage, callKernelMethod]);

  // Fetch data for selected table
  const fetchTableData = useCallback(
    async (tableName: string): Promise<void> => {
      const result = await callKernelMethod({
        method: 'executeDBQuery',
        params: { sql: `SELECT * FROM ${tableName}` },
      });
      logMessage(stringify(result, 0), 'received');
      if (!hasProperty(result, 'error')) {
        setTableData(result);
      }
    },
    [logMessage, callKernelMethod],
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
  };
}
