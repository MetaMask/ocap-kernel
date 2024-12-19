import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DatabaseInspector } from './DatabaseInspector.js';
import { useDatabaseInspector } from '../hooks/useDatabaseInspector.js';

vi.mock('../hooks/useDatabaseInspector.js', () => ({
  useDatabaseInspector: vi.fn(),
}));

vi.mock('../App.module.css', () => ({
  default: {
    dbInspector: 'db-inspector',
    dbSection: 'db-section',
    tableControls: 'table-controls',
    select: 'select',
    button: 'button',
    buttonPrimary: 'button-primary',
    querySection: 'query-section',
    input: 'input',
    table: 'table',
  },
}));

describe('DatabaseInspector Component', () => {
  const mockTables = ['table1', 'table2', 'table3'];
  const mockTableData = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
  ];

  const mockHookReturn = {
    tables: mockTables,
    selectedTable: 'table1',
    setSelectedTable: vi.fn(),
    tableData: mockTableData,
    refreshData: vi.fn(),
    executeQuery: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    vi.mocked(useDatabaseInspector).mockReturnValue(mockHookReturn);
  });

  it('renders table selector with all available tables', () => {
    render(<DatabaseInspector />);
    const selector = screen.getByRole('combobox');
    expect(selector).toBeInTheDocument();
    mockTables.forEach((table) => {
      expect(screen.getByRole('option', { name: table })).toBeInTheDocument();
    });
  });

  it('calls setSelectedTable when table selection changes', async () => {
    render(<DatabaseInspector />);
    const selector = screen.getByRole('combobox');
    await userEvent.selectOptions(selector, 'table2');
    expect(mockHookReturn.setSelectedTable).toHaveBeenCalledWith('table2');
  });

  it('renders refresh button and handles click', async () => {
    render(<DatabaseInspector />);
    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    expect(refreshButton).toBeInTheDocument();
    await userEvent.click(refreshButton);
    expect(mockHookReturn.refreshData).toHaveBeenCalled();
  });

  it('disables refresh button when no table is selected', () => {
    vi.mocked(useDatabaseInspector).mockReturnValue({
      ...mockHookReturn,
      selectedTable: '',
      tables: [],
      tableData: [],
      setSelectedTable: vi.fn(),
      refreshData: vi.fn(),
      executeQuery: vi.fn(),
    });
    render(<DatabaseInspector />);
    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    expect(refreshButton).toBeDisabled();
  });

  it('renders SQL query input and execute button', () => {
    render(<DatabaseInspector />);
    expect(
      screen.getByPlaceholderText('Enter SQL query...'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Execute Query' }),
    ).toBeInTheDocument();
  });

  it('handles SQL query input changes', async () => {
    render(<DatabaseInspector />);
    const input = screen.getByPlaceholderText('Enter SQL query...');
    await userEvent.type(input, 'SELECT * FROM table1');
    expect(input).toHaveValue('SELECT * FROM table1');
  });

  it('executes query on button click', async () => {
    render(<DatabaseInspector />);
    const input = screen.getByPlaceholderText('Enter SQL query...');
    const executeButton = screen.getByRole('button', { name: 'Execute Query' });

    await userEvent.type(input, 'SELECT * FROM table1');
    await userEvent.click(executeButton);

    expect(mockHookReturn.executeQuery).toHaveBeenCalledWith(
      'SELECT * FROM table1',
    );
  });

  it('executes query on Enter key press', async () => {
    render(<DatabaseInspector />);
    const input = screen.getByPlaceholderText('Enter SQL query...');

    await userEvent.type(input, 'SELECT * FROM table1{enter}');

    expect(mockHookReturn.executeQuery).toHaveBeenCalledWith(
      'SELECT * FROM table1',
    );
  });

  it('disables execute button when query is empty', () => {
    render(<DatabaseInspector />);
    const executeButton = screen.getByRole('button', { name: 'Execute Query' });
    expect(executeButton).toBeDisabled();
  });

  it('renders table data with correct headers and content', () => {
    render(<DatabaseInspector />);

    // Check headers
    expect(
      screen.getByRole('columnheader', { name: 'id' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'name' }),
    ).toBeInTheDocument();

    // Check data cells
    mockTableData.forEach((row) => {
      expect(
        screen.getByRole('cell', { name: String(row.id) }),
      ).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: row.name })).toBeInTheDocument();
    });
  });

  it('handles empty table data gracefully', () => {
    vi.mocked(useDatabaseInspector).mockReturnValue({
      ...mockHookReturn,
      tableData: [],
    });
    render(<DatabaseInspector />);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(table.querySelector('thead tr')).toBeEmptyDOMElement();
  });
});
