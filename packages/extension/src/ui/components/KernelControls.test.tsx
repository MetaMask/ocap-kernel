import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { KernelControls } from './KernelControls.js';
import { useKernelActions } from '../hooks/useKernelActions.js';
import { useVats } from '../hooks/useVats.js';
import type { VatRecord } from '../types.js';

vi.mock('../hooks/useKernelActions.js', () => ({
  useKernelActions: vi.fn(),
}));

vi.mock('../hooks/useVats.js', () => ({
  useVats: vi.fn(),
}));

vi.mock('../App.module.css', () => ({
  default: {
    headerControls: 'header-controls',
    buttonWarning: 'button-warning',
    buttonDanger: 'button-danger',
  },
}));

const mockUseKernelActions = (overrides = {}): void => {
  vi.mocked(useKernelActions).mockReturnValue({
    terminateAllVats: vi.fn(),
    clearState: vi.fn(),
    sendKernelCommand: vi.fn(),
    launchVat: vi.fn(),
    ...overrides,
  });
};

const mockUseVats = (vats: VatRecord[] = []): void => {
  vi.mocked(useVats).mockReturnValue({
    vats,
    selectedVatId: undefined,
    setSelectedVatId: vi.fn(),
    pingVat: vi.fn(),
    restartVat: vi.fn(),
    terminateVat: vi.fn(),
  });
};

describe('KernelControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('renders the "Clear All State" button with proper class', () => {
    mockUseKernelActions();
    mockUseVats();
    render(<KernelControls />);
    const clearButton = screen.getByRole('button', { name: 'Clear All State' });
    expect(clearButton).toBeInTheDocument();
    expect(clearButton).toHaveClass('button-danger');
  });

  it('does not render "Terminate All Vats" button when no vats exist', () => {
    mockUseKernelActions();
    mockUseVats([]);
    render(<KernelControls />);
    expect(
      screen.queryByRole('button', { name: 'Terminate All Vats' }),
    ).not.toBeInTheDocument();
  });

  it('renders "Terminate All Vats" button when vats exist', () => {
    mockUseKernelActions();
    mockUseVats([
      { id: 'v1', source: 'source', parameters: '', creationOptions: '' },
    ]);
    render(<KernelControls />);
    const terminateButton = screen.getByRole('button', {
      name: 'Terminate All Vats',
    });
    expect(terminateButton).toBeInTheDocument();
    expect(terminateButton).toHaveClass('button-warning');
  });

  it('calls terminateAllVats when "Terminate All Vats" button is clicked', async () => {
    const terminateAllVats = vi.fn();
    mockUseKernelActions({ terminateAllVats });
    mockUseVats([
      { id: 'v1', source: 'source', parameters: '', creationOptions: '' },
    ]);
    render(<KernelControls />);
    const terminateButton = screen.getByRole('button', {
      name: 'Terminate All Vats',
    });
    await userEvent.click(terminateButton);

    expect(terminateAllVats).toHaveBeenCalledTimes(1);
  });

  it('calls clearState when "Clear All State" button is clicked', async () => {
    const clearState = vi.fn();
    mockUseKernelActions({ clearState });
    mockUseVats();
    render(<KernelControls />);
    const clearButton = screen.getByRole('button', { name: 'Clear All State' });
    await userEvent.click(clearButton);
    expect(clearState).toHaveBeenCalledTimes(1);
  });
});
