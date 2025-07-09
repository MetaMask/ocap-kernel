import { Button, ButtonVariant } from '@metamask/design-system-react';
import { useEffect, useState, useCallback } from 'react';

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
    <div className="dbInspector">
      <div className="dbSection">
        <div>
          <div className="tableControls">
            <select
              className="select"
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
            <Button
              variant={ButtonVariant.Secondary}
              onClick={refreshData}
              isDisabled={!selectedTable}
            >
              Refresh
            </Button>
          </div>
        </div>
        <div className="querySection">
          <input
            className="input"
            value={sqlQuery}
            onChange={(event) => setSqlQuery(event.target.value)}
            placeholder="Enter SQL query..."
            onKeyDown={(event) => {
              if (event.key === 'Enter' && sqlQuery.trim()) {
                onExecuteQuery();
              }
            }}
          />
          <Button
            variant={ButtonVariant.Primary}
            onClick={() => onExecuteQuery()}
            isDisabled={!sqlQuery.trim()}
          >
            Execute Query
          </Button>
        </div>
      </div>

      <div className="table">
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
                        className={value?.length > 100 ? 'long' : ''}
                      >
                        <div>{value ?? ''}</div>
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
