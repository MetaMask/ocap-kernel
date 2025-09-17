import {
  Button,
  ButtonVariant,
  ButtonSize,
  Box,
  Text as TextComponent,
  TextVariant,
  TextColor,
  FontWeight,
  IconName,
} from '@metamask/design-system-react';
import { useEffect, useState, useCallback } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';
import { useDatabase } from '../hooks/useDatabase.ts';
import { Input } from './shared/Input.tsx';

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
    <Box>
      <Box className="mb-6">
        <Box className="flex flex-col md:flex-row gap-6">
          <Box className="flex flex-col gap-3">
            <TextComponent
              variant={TextVariant.BodySm}
              fontWeight={FontWeight.Medium}
              color={TextColor.TextDefault}
            >
              Select Table
            </TextComponent>
            <Box className="flex gap-3">
              <select
                className="flex items-center h-9 px-3 rounded border border-border-default text-sm bg-background-default text-text-default cursor-pointer transition-colors hover:bg-background-hover focus:outline-none focus:ring-2 focus:ring-primary-default"
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
                size={ButtonSize.Md}
                startIconName={IconName.Refresh}
                onClick={refreshData}
                isDisabled={!selectedTable}
                className="rounded-md h-9"
                data-testid="refresh-button"
              >
                <TextComponent
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  className="select-none"
                >
                  Refresh
                </TextComponent>
              </Button>
            </Box>
          </Box>
          <Box className="flex flex-col gap-3 flex-1">
            <TextComponent
              variant={TextVariant.BodySm}
              fontWeight={FontWeight.Medium}
              color={TextColor.TextDefault}
            >
              SQL Query
            </TextComponent>
            <Box className="flex gap-3">
              <Input
                value={sqlQuery}
                onChange={(event) => setSqlQuery(event.target.value)}
                placeholder="Enter SQL query..."
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && sqlQuery.trim()) {
                    onExecuteQuery();
                  }
                }}
                data-testid="sql-query-input"
              />
              <Button
                variant={ButtonVariant.Primary}
                size={ButtonSize.Md}
                onClick={() => onExecuteQuery()}
                isDisabled={!sqlQuery.trim()}
                className="rounded-md h-9"
                data-testid="execute-query-button"
              >
                <TextComponent
                  variant={TextVariant.BodySm}
                  fontWeight={FontWeight.Medium}
                  color={TextColor.PrimaryInverse}
                  className="select-none"
                >
                  Execute Query
                </TextComponent>
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box className="w-full">
        <table className="w-full border-collapse border-t border-muted">
          <thead>
            <tr className="border-b border-muted">
              {Object.keys(tableData[0] ?? {}).map((column, index, array) => (
                <th
                  key={column}
                  className={`text-left py-2 px-3 ${
                    index < array.length - 1 ? 'border-r border-muted' : ''
                  }`}
                >
                  <TextComponent
                    variant={TextVariant.BodyXs}
                    fontWeight={FontWeight.Medium}
                    color={TextColor.TextMuted}
                  >
                    {column}
                  </TextComponent>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map(
              (row, i) =>
                row && (
                  <tr
                    key={i}
                    className="hover:bg-alternative border-b border-muted"
                  >
                    {Object.entries(row).map(([key, value], index, array) => (
                      <td
                        key={key}
                        className={`py-1 px-3 ${
                          index < array.length - 1
                            ? 'border-r border-muted'
                            : ''
                        } ${value?.length > 100 ? 'break-all' : ''}`}
                      >
                        <TextComponent
                          variant={TextVariant.BodyXs}
                          color={TextColor.TextDefault}
                        >
                          {value ?? ''}
                        </TextComponent>
                      </td>
                    ))}
                  </tr>
                ),
            )}
          </tbody>
        </table>
      </Box>
    </Box>
  );
};
