import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { VatTable } from './VatTable.tsx';
import { useVats } from '../hooks/useVats.ts';
import type { VatRecord } from '../types.ts';

vi.mock('../hooks/useVats.ts', () => ({
  useVats: vi.fn(),
}));

vi.mock('../App.module.css', () => ({
  default: {
    table: 'table',
    tableActions: 'table-actions',
    smallButton: 'small-button',
  },
}));

describe('VatTable Component', () => {
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

  const mockActions = {
    pingVat: vi.fn(),
    restartVat: vi.fn(),
    terminateVat: vi.fn(),
    setSelectedVatId: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
  });

  it('renders nothing when no vats are present', () => {
    vi.mocked(useVats).mockReturnValue({
      vats: [],
      selectedVatId: undefined,
      ...mockActions,
    });
    const { container } = render(<VatTable />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders table with correct headers when vats are present', () => {
    vi.mocked(useVats).mockReturnValue({
      vats: mockVats,
      selectedVatId: undefined,
      ...mockActions,
    });
    render(<VatTable />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders correct vat data in table rows', () => {
    vi.mocked(useVats).mockReturnValue({
      vats: mockVats,
      selectedVatId: undefined,
      ...mockActions,
    });
    render(<VatTable />);
    mockVats.forEach((vat) => {
      expect(screen.getByText(vat.id)).toBeInTheDocument();
      expect(screen.getByText(vat.source)).toBeInTheDocument();
      expect(screen.getByText(vat.parameters)).toBeInTheDocument();
    });
  });

  it('renders action buttons for each vat', () => {
    vi.mocked(useVats).mockReturnValue({
      vats: [mockVats[0] as VatRecord],
      selectedVatId: undefined,
      ...mockActions,
    });
    render(<VatTable />);
    expect(screen.getByRole('button', { name: 'Ping' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Terminate' }),
    ).toBeInTheDocument();
  });

  it('calls correct action handlers when buttons are clicked', async () => {
    vi.mocked(useVats).mockReturnValue({
      vats: [mockVats[0] as VatRecord],
      selectedVatId: undefined,
      ...mockActions,
    });
    render(<VatTable />);
    await userEvent.click(screen.getByRole('button', { name: 'Ping' }));
    expect(mockActions.pingVat).toHaveBeenCalledWith('vat-1');
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(mockActions.restartVat).toHaveBeenCalledWith('vat-1');
    await userEvent.click(screen.getByRole('button', { name: 'Terminate' }));
    expect(mockActions.terminateVat).toHaveBeenCalledWith('vat-1');
  });

  it('applies correct CSS classes', () => {
    vi.mocked(useVats).mockReturnValue({
      vats: [mockVats[0] as VatRecord],
      selectedVatId: undefined,
      ...mockActions,
    });
    render(<VatTable />);
    expect(screen.getByRole('table').parentElement).toHaveClass('table');
    expect(screen.getByRole('cell', { name: /ping/iu }).firstChild).toHaveClass(
      'table-actions',
    );
    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      expect(button).toHaveClass('small-button');
    });
  });
});
