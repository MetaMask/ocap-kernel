import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useDatabaseInspector } from './useDatabaseInspector.js';
import { usePanelContext } from '../context/PanelContext.js';
import { isErrorResponse } from '../utils.js';

vi.mock('../context/PanelContext.js', () => ({
  usePanelContext: vi.fn(),
}));

vi.mock('../utils.js', () => ({
  isErrorResponse: vi.fn(),
}));

vi.mock('../../kernel-integration/messages.js', () => ({
  KernelControlMethod: {
    sendMessage: 'sendMessage',
    executeDBQuery: 'executeDBQuery',
  },
}));

vi.mock('@ocap/utils', () => ({
  stringify: JSON.stringify,
}));

describe('useDatabaseInspector', () => {
  const mockSendMessage = vi.fn();
  const mockLogMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePanelContext).mockReturnValue({
      sendMessage: mockSendMessage,
      logMessage: mockLogMessage,
    } as unknown as ReturnType<typeof usePanelContext>);
  });

  describe('initial state', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useDatabaseInspector());
      expect(result.current).toStrictEqual({
        tables: [],
        selectedTable: '',
        setSelectedTable: expect.any(Function),
        tableData: [],
        refreshData: expect.any(Function),
        executeQuery: expect.any(Function),
      });
    });

    it('should fetch tables on mount', async () => {
      const mockTables = [{ name: 'table1' }, { name: 'table2' }];
      mockSendMessage.mockResolvedValueOnce(mockTables);
      vi.mocked(isErrorResponse).mockReturnValue(false);
      renderHook(() => useDatabaseInspector());
      expect(mockSendMessage).toHaveBeenCalledWith({
        method: 'executeDBQuery',
        params: { sql: "SELECT name FROM sqlite_master WHERE type='table'" },
      });
    });
  });

  describe('table selection', () => {
    it('should update selected table and fetch its data', async () => {
      const { result } = renderHook(() => useDatabaseInspector());
      const mockTableData = [{ id: 1, name: 'test' }];
      mockSendMessage.mockResolvedValueOnce(mockTableData);
      vi.mocked(isErrorResponse).mockReturnValue(false);
      await act(async () => {
        result.current.setSelectedTable('testTable');
      });
      expect(result.current.selectedTable).toBe('testTable');
      expect(mockSendMessage).toHaveBeenCalledWith({
        method: 'executeDBQuery',
        params: { sql: 'SELECT * FROM testTable' },
      });
    });

    it('should set first table as selected when tables are fetched', async () => {
      const mockTables = [{ name: 'table1' }, { name: 'table2' }];
      mockSendMessage.mockResolvedValueOnce(mockTables);
      vi.mocked(isErrorResponse).mockReturnValue(false);
      const { result } = renderHook(() => useDatabaseInspector());
      await waitFor(() => {
        expect(result.current.selectedTable).toBe('table1');
      });
    });
  });

  describe('executeQuery', () => {
    it('should send query and update table data on success', async () => {
      const { result } = renderHook(() => useDatabaseInspector());
      const mockQueryResult = [{ id: 1, value: 'test' }];
      mockSendMessage.mockResolvedValueOnce(mockQueryResult);
      vi.mocked(isErrorResponse).mockReturnValue(false);
      await act(async () => {
        result.current.executeQuery('SELECT * FROM test');
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        method: 'executeDBQuery',
        params: { sql: 'SELECT * FROM test' },
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        JSON.stringify(mockQueryResult),
        'received',
      );
    });

    it('should handle query execution errors', async () => {
      const { result } = renderHook(() => useDatabaseInspector());
      const error = new Error('Query failed');
      mockSendMessage.mockRejectedValueOnce(error);
      await act(async () => {
        result.current.executeQuery('INVALID SQL');
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Failed to execute query: Error: Query failed',
        'error',
      );
    });

    it('should not update table data on error response', async () => {
      const { result } = renderHook(() => useDatabaseInspector());
      const errorResponse = { error: 'Invalid query' };
      mockSendMessage.mockResolvedValueOnce(errorResponse);
      vi.mocked(isErrorResponse).mockReturnValue(true);
      await act(async () => {
        result.current.executeQuery('SELECT * FROM test');
      });
      expect(result.current.tableData).toStrictEqual([]);
    });
  });

  describe('refreshData', () => {
    it('should fetch data for selected table', async () => {
      const { result } = renderHook(() => useDatabaseInspector());
      const mockTableData = [{ id: 1, name: 'test' }];
      mockSendMessage.mockResolvedValueOnce(mockTableData);
      vi.mocked(isErrorResponse).mockReturnValue(false);
      await act(async () => {
        result.current.setSelectedTable('testTable');
      });
      mockSendMessage.mockClear();
      await act(async () => {
        result.current.refreshData();
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        method: 'executeDBQuery',
        params: { sql: 'SELECT * FROM testTable' },
      });
    });

    it('should handle refresh errors', async () => {
      const { result } = renderHook(() => useDatabaseInspector());
      await act(async () => {
        result.current.setSelectedTable('testTable');
      });
      const error = new Error('Refresh failed');
      mockSendMessage.mockRejectedValueOnce(error);
      await act(async () => {
        result.current.refreshData();
      });
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Failed to fetch data for table testTable: Error: Refresh failed',
        'error',
      );
    });
  });

  it('should handle table data fetch errors', async () => {
    const { result } = renderHook(() => useDatabaseInspector());
    const error = new Error('Failed to fetch data');
    mockSendMessage.mockRejectedValueOnce(error);
    await act(async () => {
      result.current.setSelectedTable('testTable');
    });
    expect(mockLogMessage).toHaveBeenCalledWith(
      'Failed to fetch data for table testTable: Error: Failed to fetch data',
      'error',
    );
  });
});
