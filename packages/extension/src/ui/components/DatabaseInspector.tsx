import { useEffect, useState, useCallback } from 'react';

import styles from '../App.module.css';
import { usePanelContext } from '../context/PanelContext.tsx';
import { useDatabase } from '../hooks/useDatabase.ts';

/**
 * @returns - The DatabaseInspector component
 */
export const DatabaseInspector: React.FC = () => {
  const { logMessage } = usePanelContext();
  const [sqlQuery, setSqlQuery] = useState('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableData, setTableData] = useState<Record<string, string>[]>([]);
  const { fetchTables, fetchTableData, executeQuery } = useDatabase();

  const onExecuteQuery = useCallback(() => {
    executeQuery(sqlQuery)
      .then((data: Record<string, string>[]) => {
        setSelectedTable('');
        return setTableData(data);
      })
      .catch((error: Error) =>
        logMessage(`Failed to execute query: ${error.message}`, 'error'),
      );
  }, [executeQuery, logMessage, sqlQuery]);

  // Refresh data for selected table
  const refreshData = useCallback(() => {
    fetchTableData(selectedTable)
      .then(setTableData)
      .catch((error: Error) =>
        logMessage(
          `Failed to fetch data for table ${selectedTable}: ${error.message}`,
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
    fetchTables()
      .then((tableNames: string[]) => {
        setTables(tableNames);
        return setSelectedTable(tableNames?.[0] ?? '');
      })
      .catch((error: Error) =>
        logMessage(`Failed to fetch tables: ${error.message}`, 'error'),
      );
  }, [fetchTables, logMessage]);

  return (
    <div className={styles.dbInspector}>
      <div className={styles.dbSection}>
        <div>
          <div className={styles.tableControls}>
            <select
              className={styles.select}
              value={selectedTable}
              onChange={(event) => setSelectedTable(event.target.value)}
            >
              <option value="" disabled>
                Select a table
              </option>
              {tables.map((table) => (
                <option key={table} value={table}>
                  {table}
                </option>
              ))}
            </select>
            <button
              className={styles.button}
              onClick={refreshData}
              disabled={!selectedTable}
            >
              Refresh
            </button>
          </div>
        </div>
        <div className={styles.querySection}>
          <input
            className={styles.input}
            value={sqlQuery}
            onChange={(event) => setSqlQuery(event.target.value)}
            placeholder="Enter SQL query..."
            onKeyDown={(event) => {
              if (event.key === 'Enter' && sqlQuery.trim()) {
                onExecuteQuery();
              }
            }}
          />
          <button
            className={styles.buttonPrimary}
            onClick={() => onExecuteQuery()}
            disabled={!sqlQuery.trim()}
          >
            Execute Query
          </button>
        </div>
      </div>

      <div className={styles.table}>
        <table>
          <thead>
            <tr>
              {Object.keys(tableData[0] ?? {}).map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map(
              (row, i) =>
                row && (
                  <tr key={i}>
                    {Object.entries(row).map(([key, value]) => (
                      <td
                        key={key}
                        className={value?.length > 100 ? styles.long : ''}
                      >
                        <div className={styles.cellContent}>{value ?? ''}</div>
                      </td>
                    ))}
                  </tr>
                ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
