import { waitFor, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useDatabase } from './useDatabase.ts';
import { usePanelContext } from '../context/PanelContext.tsx';

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

vi.mock('@metamask/kernel-utils', () => ({
  stringify: JSON.stringify,
}));

vi.mock('../services/db-parser.ts', () => ({
  parseObjectRegistry: vi.fn(),
}));

describe('useDatabase', () => {
  const mockCallKernelMethod = vi.fn();
  const mockLogMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePanelContext).mockReturnValue({
      callKernelMethod: mockCallKernelMethod,
      logMessage: mockLogMessage,
    } as unknown as ReturnType<typeof usePanelContext>);
  });

  describe('hook interface', () => {
    it('should return the expected methods', () => {
      const { result } = renderHook(() => useDatabase());
      expect(result.current).toStrictEqual({
        fetchTables: expect.any(Function),
        fetchTableData: expect.any(Function),
        executeQuery: expect.any(Function),
      });
    });
  });

  describe('fetchTables', () => {
    it('should call the correct kernel method to fetch tables', async () => {
      const { result } = renderHook(() => useDatabase());
      const mockTables = [{ name: 'table1' }, { name: 'table2' }];
      mockCallKernelMethod.mockResolvedValueOnce(mockTables);
      const tables = await result.current.fetchTables();
      expect(mockCallKernelMethod).toHaveBeenCalledWith({
        method: 'executeDBQuery',
        params: { sql: "SELECT name FROM sqlite_master WHERE type='table'" },
      });
      await waitFor(() => {
        expect(tables).toStrictEqual(['table1', 'table2']);
        expect(mockLogMessage).toHaveBeenCalledWith(
          JSON.stringify(mockTables),
          'received',
        );
      });
    });

    it('should handle errors when fetching tables', async () => {
      const { result } = renderHook(() => useDatabase());
      const errorResponse = { error: 'Database error' };
      mockCallKernelMethod.mockResolvedValueOnce(errorResponse);
      await expect(result.current.fetchTables()).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('fetchTableData', () => {
    it('should call the correct kernel method to fetch table data', async () => {
      const { result } = renderHook(() => useDatabase());
      const mockTableData = [{ id: '1', name: 'test' }];
      mockCallKernelMethod.mockResolvedValueOnce(mockTableData);

      const data = await result.current.fetchTableData('testTable');
      expect(mockCallKernelMethod).toHaveBeenCalledWith({
        method: 'executeDBQuery',
        params: { sql: 'SELECT * FROM testTable' },
      });
      expect(data).toStrictEqual(mockTableData);
      expect(mockLogMessage).toHaveBeenCalledWith(
        JSON.stringify(mockTableData),
        'received',
      );
    });

    it('should handle errors when fetching table data', async () => {
      const { result } = renderHook(() => useDatabase());
      const errorResponse = { error: 'Table not found' };
      mockCallKernelMethod.mockResolvedValueOnce(errorResponse);
      await expect(
        result.current.fetchTableData('nonExistentTable'),
      ).rejects.toThrow('Table not found');
    });
  });

  describe('executeQuery', () => {
    it('should call the correct kernel method to execute a query', async () => {
      const { result } = renderHook(() => useDatabase());
      const mockQueryResult = [{ id: '1', value: 'test' }];
      mockCallKernelMethod.mockResolvedValueOnce(mockQueryResult);
      await result.current.executeQuery('SELECT * FROM test');
      expect(mockCallKernelMethod).toHaveBeenCalledWith({
        method: 'executeDBQuery',
        params: { sql: 'SELECT * FROM test' },
      });
    });

    it('should log success results', async () => {
      const { result } = renderHook(() => useDatabase());
      const mockQueryResult = [{ id: '1', value: 'test' }];
      mockCallKernelMethod.mockResolvedValueOnce(mockQueryResult);
      await result.current.executeQuery('SELECT * FROM test');
      await new Promise(process.nextTick);
      expect(mockLogMessage).toHaveBeenCalledWith(
        JSON.stringify(mockQueryResult),
        'received',
      );
    });

    it('should handle promise rejection errors', async () => {
      const { result } = renderHook(() => useDatabase());
      const error = new Error('Query failed');
      mockCallKernelMethod.mockRejectedValueOnce(error);
      await expect(result.current.executeQuery('INVALID SQL')).rejects.toThrow(
        'Query failed',
      );
    });

    it('should handle error response objects', async () => {
      const { result } = renderHook(() => useDatabase());
      const errorResponse = { error: 'Invalid query' };
      mockCallKernelMethod.mockResolvedValueOnce(errorResponse);
      await expect(
        result.current.executeQuery('SELECT * FROM test'),
      ).rejects.toThrow('Invalid query');
    });
  });
});
