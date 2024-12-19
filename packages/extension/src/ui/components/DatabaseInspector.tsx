import { useState } from 'react';

import styles from '../App.module.css';
import { useDatabaseInspector } from '../hooks/useDatabaseInspector.js';

const DataTable: React.FC<{ data: Record<string, string>[] }> = ({ data }) => {
  if (data.length === 0) {
    return null;
  }

  return (
    <div className={styles.queryResults}>
      <table>
        <thead>
          <tr>
            {Object.keys(data[0] ?? {}).map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(
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
  );
};

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
    queryResults,
    queryError,
  } = useDatabaseInspector();

  return (
    <div className={styles.dbInspector}>
      <div className={styles.dbSection}>
        <h3>DB Tables</h3>
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
      <DataTable data={tableData} />

      <h3 className={styles.dbSectionTitle}>SQL Query</h3>
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
      {queryError && <div className={styles.error}>{queryError}</div>}
      <DataTable data={queryResults} />
    </div>
  );
};
