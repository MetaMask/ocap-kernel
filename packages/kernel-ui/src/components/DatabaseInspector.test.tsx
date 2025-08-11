import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DatabaseInspector } from './DatabaseInspector.tsx';
import { usePanelContext } from '../context/PanelContext.tsx';
import type { PanelContextType } from '../context/PanelContext.tsx';
import { useDatabase } from '../hooks/useDatabase.ts';

// Mock the hooks
vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

vi.mock('../hooks/useDatabase.ts', () => ({
  useDatabase: vi.fn(),
}));

const mockUsePanelContext: PanelContextType = {
  callKernelMethod: vi.fn(),
  status: undefined,
  logMessage: vi.fn(),
  messageContent: '',
  setMessageContent: vi.fn(),
  panelLogs: [],
  clearLogs: vi.fn(),
  isLoading: false,
  objectRegistry: null,
  setObjectRegistry: vi.fn(),
};

describe('DatabaseInspector Component', () => {
  const mockLogMessage = vi.fn();
  const mockFetchTables = vi.fn();
  const mockFetchTableData = vi.fn();
  const mockExecuteQuery = vi.fn();

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockUsePanelContext.logMessage = mockLogMessage;
    vi.mocked(usePanelContext).mockReturnValue(mockUsePanelContext);

    // Set default resolved values for all mocks to prevent undefined errors
    mockFetchTables.mockResolvedValue([]);
    mockFetchTableData.mockResolvedValue([]);
    mockExecuteQuery.mockResolvedValue([]);

    vi.mocked(useDatabase).mockReturnValue({
      fetchTables: mockFetchTables,
      fetchTableData: mockFetchTableData,
      executeQuery: mockExecuteQuery,
    });
  });

  it('loads and displays tables and data on mount', async () => {
    mockFetchTables.mockResolvedValue(['table1', 'table2']);
    mockFetchTableData.mockResolvedValue([{ col1: 'val1', col2: 'val2' }]);
    render(<DatabaseInspector />);
    await screen.findByRole('combobox');
    const select = screen.getByRole('combobox');
    await waitFor(() => {
      expect(select).toHaveValue('table1');
      expect(
        screen.getByRole('option', { name: 'table1' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: 'table2' }),
      ).toBeInTheDocument();
      expect(mockFetchTableData).toHaveBeenCalledWith('table1');
      expect(screen.getByText('col1')).toBeInTheDocument();
      expect(screen.getByText('col2')).toBeInTheDocument();
      expect(screen.getByText('val1')).toBeInTheDocument();
      expect(screen.getByText('val2')).toBeInTheDocument();
    });
  });

  it('allows table selection and refreshes data', async () => {
    mockFetchTables.mockResolvedValue(['tableA', 'tableB']);
    mockFetchTableData
      .mockResolvedValueOnce([{ a: '1' }])
      .mockResolvedValueOnce([{ b: '2' }])
      .mockResolvedValueOnce([{ b: '3' }]);

    render(<DatabaseInspector />);
    await screen.findByRole('combobox');
    await waitFor(() => {
      expect(mockFetchTableData).toHaveBeenCalledWith('tableA');
    });
    await userEvent.selectOptions(screen.getByRole('combobox'), 'tableB');
    await waitFor(() => {
      expect(mockFetchTableData).toHaveBeenCalledWith('tableB');
    });
    const refreshButton = screen.getByRole('button', {
      name: 'Refresh',
    });
    await userEvent.click(refreshButton);
    expect(mockFetchTableData).toHaveBeenCalledWith('tableB');
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('executes query and displays results', async () => {
    mockFetchTables.mockResolvedValue([]);
    mockExecuteQuery.mockResolvedValue([{ x: '100' }]);
    render(<DatabaseInspector />);
    const input = screen.getByPlaceholderText('Enter SQL query...');
    await userEvent.type(input, 'SELECT x');
    const execButton = screen.getByRole('button', { name: 'Execute Query' });
    await userEvent.click(execButton);
    expect(mockExecuteQuery).toHaveBeenCalledWith('SELECT x');
    expect(await screen.findByText('x')).toBeInTheDocument();
    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('executes query on Enter key press', async () => {
    mockFetchTables.mockResolvedValue([]);
    mockExecuteQuery.mockResolvedValue([{ y: '200' }]);
    render(<DatabaseInspector />);
    const input = screen.getByPlaceholderText('Enter SQL query...');
    input.focus();
    await userEvent.type(input, 'SELECT y{Enter}');
    expect(mockExecuteQuery).toHaveBeenCalledWith('SELECT y');
    expect(await screen.findByText('200')).toBeInTheDocument();
  });

  it('logs error when fetchTables fails', async () => {
    mockFetchTables.mockRejectedValue(new Error('fetch tables error'));
    render(<DatabaseInspector />);
    await waitFor(() => {
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Failed to fetch tables: fetch tables error',
        'error',
      );
    });
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('logs error when refreshData fails', async () => {
    mockFetchTables.mockResolvedValue(['t1']);
    mockFetchTableData.mockRejectedValue(new Error('data error'));

    render(<DatabaseInspector />);

    // Wait for tables to load and first table to be selected
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('t1');
    });

    // Now wait for the error from the automatic data fetch
    await waitFor(() => {
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Failed to fetch data for table t1: data error',
        'error',
      );
    });

    // Clear mocks before testing refresh button
    mockLogMessage.mockClear();

    const refreshButton = screen.getByRole('button', {
      name: 'Refresh',
    });
    await userEvent.click(refreshButton);

    // Wait for the error to be logged again
    await waitFor(() => {
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Failed to fetch data for table t1: data error',
        'error',
      );
    });
  });

  it('logs error when executeQuery fails', async () => {
    mockFetchTables.mockResolvedValue([]);
    mockExecuteQuery.mockRejectedValue(new Error('exec error'));
    render(<DatabaseInspector />);
    const input = screen.getByPlaceholderText('Enter SQL query...');
    await userEvent.type(input, 'SELECT z');
    await userEvent.click(
      screen.getByRole('button', { name: 'Execute Query' }),
    );
    await waitFor(() => {
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Failed to execute query: exec error',
        'error',
      );
    });
  });
});
