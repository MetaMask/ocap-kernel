import { render, screen, cleanup, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SubclustersTable } from './SubclustersTable.tsx';
import { useVats } from '../hooks/useVats.ts';
import type { VatRecord } from '../types.ts';

vi.mock('../hooks/useVats.ts', () => ({
  useVats: vi.fn(),
}));

vi.mock('../App.module.css', () => ({
  default: {
    table: 'table',
    subclusterTable: 'subcluster-table',
    tableActions: 'table-actions',
    smallButton: 'small-button',
    accordion: 'accordion',
    accordionHeader: 'accordion-header',
    accordionTitle: 'accordion-title',
    accordionIndicator: 'accordion-indicator',
    accordionContent: 'accordion-content',
    headerControls: 'header-controls',
    buttonDanger: 'button-danger',
    buttonBlack: 'button-black',
    vatDetailsHeader: 'vat-details-header',
    tableContainer: 'table-container',
  },
}));

describe('SubclustersTable Component', () => {
  const mockVats: VatRecord[] = [
    {
      id: 'vat-1',
      source: 'source-1',
      parameters: 'params-1',
      creationOptions: '',
    },
    {
      id: 'vat-2',
      source: 'source-2',
      parameters: 'params-2',
      creationOptions: '',
    },
  ];

  const mockVatConfig = {
    'vat-1': {
      bundleSpec: 'source-1',
      parameters: { foo: 'bar' },
    },
    'vat-2': {
      bundleSpec: 'source-2',
      parameters: { baz: 'qux' },
    },
  };

  const mockSubclusters = [
    {
      id: 'subcluster-1',
      vats: ['vat-1', 'vat-2'],
      config: {
        bootstrap: 'bootstrap-1',
        vats: mockVatConfig,
      },
      vatRecords: mockVats,
    },
  ];

  const mockActions = {
    pingVat: vi.fn(),
    restartVat: vi.fn(),
    terminateVat: vi.fn(),
    terminateSubcluster: vi.fn(),
    reloadSubcluster: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders message when no subclusters are present', () => {
    vi.mocked(useVats).mockReturnValue({
      subclusters: [],
      ...mockActions,
      hasVats: false,
    });
    render(<SubclustersTable />);
    expect(
      screen.getByText('No vats or subclusters are currently active.'),
    ).toBeInTheDocument();
  });

  it('renders subcluster accordion with correct title and vat count', () => {
    vi.mocked(useVats).mockReturnValue({
      subclusters: mockSubclusters,
      ...mockActions,
      hasVats: true,
    });
    render(<SubclustersTable />);
    expect(screen.getByText('Subcluster subcluster-1 -')).toBeInTheDocument();
    expect(screen.getByText('2 Vats')).toBeInTheDocument();
  });

  it('expands and collapses subcluster accordion on click', async () => {
    vi.mocked(useVats).mockReturnValue({
      subclusters: mockSubclusters,
      ...mockActions,
      hasVats: true,
    });
    render(<SubclustersTable />);

    // Initially collapsed
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // Expand
    await userEvent.click(screen.getByText('Subcluster subcluster-1 -'));
    expect(screen.getByRole('table')).toBeInTheDocument();

    // Collapse
    await userEvent.click(screen.getByText('Subcluster subcluster-1 -'));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders table with correct headers when expanded', async () => {
    vi.mocked(useVats).mockReturnValue({
      subclusters: mockSubclusters,
      ...mockActions,
      hasVats: true,
    });
    render(<SubclustersTable />);
    await userEvent.click(screen.getByText('Subcluster subcluster-1 -'));

    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders correct vat data in table rows when expanded', async () => {
    vi.mocked(useVats).mockReturnValue({
      subclusters: mockSubclusters,
      ...mockActions,
      hasVats: true,
    });
    render(<SubclustersTable />);
    await userEvent.click(screen.getByText('Subcluster subcluster-1 -'));

    mockVats.forEach((vat) => {
      expect(screen.getByText(vat.id)).toBeInTheDocument();
      expect(screen.getByText(vat.source)).toBeInTheDocument();
      expect(screen.getByText(vat.parameters)).toBeInTheDocument();
    });
  });

  it('calls correct action handlers when vat buttons are clicked', async () => {
    vi.mocked(useVats).mockReturnValue({
      subclusters: mockSubclusters,
      ...mockActions,
      hasVats: true,
    });
    render(<SubclustersTable />);
    await userEvent.click(screen.getByText('Subcluster subcluster-1 -'));

    // Get the first vat row's buttons
    const firstVatRow = screen
      .getByTestId('vat-table')
      .querySelector('tr[data-vat-id="vat-1"]');
    const rowContainer = firstVatRow as HTMLElement;
    const pingButton = within(rowContainer).getByRole('button', {
      name: 'Ping',
    });
    const restartButton = within(rowContainer).getByRole('button', {
      name: 'Restart',
    });
    const terminateButton = within(rowContainer).getByRole('button', {
      name: 'Terminate',
    });

    await userEvent.click(pingButton);
    expect(mockActions.pingVat).toHaveBeenCalledWith('vat-1');

    await userEvent.click(restartButton);
    expect(mockActions.restartVat).toHaveBeenCalledWith('vat-1');

    await userEvent.click(terminateButton);
    expect(mockActions.terminateVat).toHaveBeenCalledWith('vat-1');
  });

  it('calls correct action handlers when subcluster buttons are clicked', async () => {
    vi.mocked(useVats).mockReturnValue({
      subclusters: mockSubclusters,
      ...mockActions,
      hasVats: true,
    });
    render(<SubclustersTable />);
    await userEvent.click(screen.getByText('Subcluster subcluster-1 -'));

    await userEvent.click(
      screen.getByRole('button', { name: 'Terminate Subcluster' }),
    );
    expect(mockActions.terminateSubcluster).toHaveBeenCalledWith(
      'subcluster-1',
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Reload Subcluster' }),
    );
    expect(mockActions.reloadSubcluster).toHaveBeenCalledWith('subcluster-1');
  });

  it('opens config modal when View Config button is clicked', async () => {
    vi.mocked(useVats).mockReturnValue({
      subclusters: mockSubclusters,
      ...mockActions,
      hasVats: true,
    });
    render(<SubclustersTable />);
    await userEvent.click(screen.getByText('Subcluster subcluster-1 -'));

    // Initially modal should not be visible
    expect(
      screen.queryByText('Subcluster subcluster-1 Configuration'),
    ).not.toBeInTheDocument();

    // Click View Config button
    await userEvent.click(screen.getByRole('button', { name: 'View Config' }));

    // Modal should now be visible
    expect(
      screen.getByText('Subcluster subcluster-1 Configuration'),
    ).toBeInTheDocument();

    // Check that the config is displayed in the textarea
    const textarea = screen.getByTestId('config-textarea');
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toContain('bootstrap');
  });
});
