import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ObjectRegistry } from './ObjectRegistry.tsx';
import { useDatabase } from '../hooks/useDatabase.ts';
import type { ClusterSnapshot } from '../services/db-parser.ts';
import * as dbParser from '../services/db-parser.ts';

// Mock the hooks and services
vi.mock('../hooks/useDatabase.ts', () => ({
  useDatabase: vi.fn(),
}));

vi.mock('../services/db-parser.ts', () => ({
  parseKernelDB: vi.fn(),
}));

// Mock the CSS module
vi.mock('../App.module.css', () => ({
  default: {
    container: 'container',
    error: 'error',
    headerSection: 'header-section',
    noMargin: 'no-margin',
    button: 'button',
    noBorder: 'no-border',
    table: 'table',
    accordion: 'accordion',
    accordionHeader: 'accordion-header',
    accordionTitle: 'accordion-title',
    accordionIndicator: 'accordion-indicator',
    accordionContent: 'accordion-content',
    tableContainer: 'table-container',
    vatDetailsHeader: 'vat-details-header',
  },
}));

describe('ObjectRegistry Component', () => {
  // Set up mock data
  const mockData = {
    gcActions: 'mockGcActions',
    reapQueue: 'mockReapQueue',
    terminatedVats: 'mockTerminatedVats',
    vats: {
      vat1: {
        overview: {
          name: 'Test Vat 1',
        },
        ownedObjects: [
          {
            kref: 'ko1',
            eref: 'o+1',
            refCount: 2,
            toVats: ['vat2', 'vat3'],
          },
        ],
        importedObjects: [
          {
            kref: 'ko2',
            eref: 'o-2',
            refCount: 1,
            fromVat: 'vat2',
          },
        ],
        importedPromises: [
          {
            kref: 'kp1',
            eref: 'p-1',
            state: 'fulfilled',
            value: {
              body: 'value1',
              slots: [{ kref: 'ko3', eref: 'o+3' }],
            },
            fromVat: 'vat2',
          },
        ],
        exportedPromises: [
          {
            kref: 'kp2',
            eref: 'p+2',
            state: 'pending',
            value: { body: '', slots: [] },
            toVats: ['vat3'],
          },
        ],
      },
    },
  };

  const mockExecuteQuery = vi.fn();

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();

    vi.mocked(useDatabase).mockReturnValue({
      executeQuery: mockExecuteQuery,
      fetchTables: vi.fn(),
      fetchTableData: vi.fn(),
    });

    vi.mocked(dbParser.parseKernelDB).mockReturnValue(
      mockData as unknown as ClusterSnapshot,
    );
  });

  it('renders loading state initially', () => {
    // Set executeQuery to not resolve immediately to keep component in loading state
    mockExecuteQuery.mockReturnValue(
      new Promise(() => {
        // do nothing
      }),
    );

    render(<ObjectRegistry />);

    expect(screen.getByText('Loading cluster data...')).toBeInTheDocument();
  });

  it('renders error state when database query fails', async () => {
    const errorMessage = 'Failed to fetch data';
    mockExecuteQuery.mockRejectedValue(new Error(errorMessage));

    render(<ObjectRegistry />);

    await waitFor(() => {
      expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
    });
  });

  it('renders error message when no data is returned', async () => {
    mockExecuteQuery.mockResolvedValue([]);
    vi.mocked(dbParser.parseKernelDB).mockReturnValue(
      null as unknown as ClusterSnapshot,
    );

    render(<ObjectRegistry />);

    await waitFor(() => {
      expect(
        screen.getByText('Error: No cluster data available'),
      ).toBeInTheDocument();
    });
  });

  it('renders cluster data when successfully fetched', async () => {
    const mockDbResult = [{ key: 'key1', value: 'value1' }];
    mockExecuteQuery.mockResolvedValue(mockDbResult);

    render(<ObjectRegistry />);

    await waitFor(() => {
      expect(screen.getByText('Kernel Registry')).toBeInTheDocument();
      expect(screen.getByText('mockGcActions')).toBeInTheDocument();
      expect(screen.getByText('mockReapQueue')).toBeInTheDocument();
      expect(screen.getByText('mockTerminatedVats')).toBeInTheDocument();
      expect(screen.getByText(/Test Vat 1/u)).toBeInTheDocument();
    });

    // Verify that executeQuery and parseKernelDB were called correctly
    expect(mockExecuteQuery).toHaveBeenCalledWith('SELECT key, value FROM kv');
    expect(dbParser.parseKernelDB).toHaveBeenCalledWith(mockDbResult);
  });

  it('expands vat details when clicked', async () => {
    mockExecuteQuery.mockResolvedValue([{ key: 'key1', value: 'value1' }]);

    render(<ObjectRegistry />);

    await waitFor(() => {
      expect(screen.getByText(/Test Vat 1/u)).toBeInTheDocument();
    });

    // Initially, vat details should not be visible
    expect(screen.queryByText('Owned Objects')).not.toBeInTheDocument();

    // Click on vat header to expand it
    await userEvent.click(screen.getByText(/Test Vat 1/u));

    // After expanding, details should be visible
    expect(screen.getByText('Owned Objects')).toBeInTheDocument();
    expect(screen.getByText('Imported Objects')).toBeInTheDocument();
    expect(screen.getByText('Imported Promises')).toBeInTheDocument();
    expect(screen.getByText('Exported Promises')).toBeInTheDocument();

    // Object details should be displayed
    expect(screen.getByText('ko1')).toBeInTheDocument();
    expect(screen.getByText('o+1')).toBeInTheDocument();

    // Click again to collapse
    await userEvent.click(screen.getByText(/Test Vat 1/u));

    // After collapsing, details should not be visible
    expect(screen.queryByText('Owned Objects')).not.toBeInTheDocument();
  });

  it('refreshes data when refresh button is clicked', async () => {
    mockExecuteQuery.mockResolvedValue([{ key: 'key1', value: 'value1' }]);

    render(<ObjectRegistry />);

    await waitFor(() => {
      expect(screen.getByText('Kernel Registry')).toBeInTheDocument();
    });

    // Clear mocks to verify the second call
    mockExecuteQuery.mockClear();

    // Click refresh button
    await userEvent.click(screen.getByText('Refresh'));

    // Verify that executeQuery was called again
    expect(mockExecuteQuery).toHaveBeenCalledWith('SELECT key, value FROM kv');
  });
});
