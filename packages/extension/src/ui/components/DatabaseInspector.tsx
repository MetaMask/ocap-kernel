import { useState } from 'react';

import styles from '../App.module.css';
import { useDatabaseInspector } from '../hooks/useDatabaseInspector.js';

/**
 * @returns - The DatabaseInspector component
 */
export const DatabaseInspector: React.FC = () => {
  const [sqlQuery, setSqlQuery] = useState('');
  const {
    tables,
    selectedTable,
    setSelectedTable,
    tableData,
    refreshData,
    executeQuery,
  } = useDatabaseInspector();

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
          />
          <button
            className={styles.buttonPrimary}
            onClick={() => executeQuery(sqlQuery)}
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
                      <td key={key}>{value ?? ''}</td>
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
