import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { VatRepl } from './VatRepl.tsx';
import { usePanelContext } from '../context/PanelContext.tsx';
import type { PanelContextType } from '../context/PanelContext.tsx';
import { useEvaluate } from '../hooks/useEvaluate.ts';

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

vi.mock('../hooks/useEvaluate.ts', () => ({
  useEvaluate: vi.fn(),
}));

describe('VatRepl Component', () => {
  const mockLogMessage = vi.fn();
  const mockEvaluateVat = vi.fn();
  const mockCallKernelMethod = vi.fn();

  const mockPanelContext: PanelContextType = {
    callKernelMethod: mockCallKernelMethod,
    status: {
      vats: [
        {
          id: 'v1',
          config: { sourceSpec: 'test.js' },
          subclusterId: 's1',
        },
        {
          id: 'v2',
          config: { sourceSpec: 'test2.js' },
          subclusterId: 's1',
        },
      ],
      subclusters: [],
      remoteComms: { isInitialized: false },
    },
    logMessage: mockLogMessage,
    messageContent: '',
    setMessageContent: vi.fn(),
    panelLogs: [],
    clearLogs: vi.fn(),
    isLoading: false,
    objectRegistry: null,
    setObjectRegistry: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(usePanelContext).mockReturnValue(mockPanelContext);
    vi.mocked(useEvaluate).mockReturnValue({
      evaluateVat: mockEvaluateVat,
    });
  });

  it('renders vat selector with available vats', () => {
    render(<VatRepl />);
    const selector = screen.getByTestId('vat-selector');
    expect(selector).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'v1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'v2' })).toBeInTheDocument();
  });

  it('renders code input and evaluate button', () => {
    render(<VatRepl />);
    expect(screen.getByTestId('code-input')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Evaluate' }),
    ).toBeInTheDocument();
  });

  it('disables evaluate button when no vat selected or no code', () => {
    render(<VatRepl />);
    const button = screen.getByRole('button', { name: 'Evaluate' });
    expect(button).toBeDisabled();
  });

  it('evaluates code and displays success result', async () => {
    mockEvaluateVat.mockResolvedValueOnce({ success: true, value: 42 });
    render(<VatRepl />);

    await userEvent.selectOptions(screen.getByTestId('vat-selector'), 'v1');
    await userEvent.type(screen.getByTestId('code-input'), '21 * 2');
    await userEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    expect(mockEvaluateVat).toHaveBeenCalledWith('v1', '21 * 2');

    await waitFor(() => {
      expect(screen.getByTestId('result-display')).toBeInTheDocument();
      expect(screen.getByTestId('result-display')).toHaveTextContent('42');
    });

    expect(mockLogMessage).toHaveBeenCalledWith(
      'Evaluated in v1: 42',
      'success',
    );
  });

  it('evaluates code and displays error result', async () => {
    mockEvaluateVat.mockResolvedValueOnce({
      success: false,
      error: 'ReferenceError: x is not defined',
    });
    render(<VatRepl />);

    await userEvent.selectOptions(screen.getByTestId('vat-selector'), 'v1');
    await userEvent.type(screen.getByTestId('code-input'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    await waitFor(() => {
      expect(screen.getByTestId('result-display')).toHaveTextContent(
        'ReferenceError: x is not defined',
      );
    });

    expect(mockLogMessage).toHaveBeenCalledWith(
      'Evaluation error in v1: ReferenceError: x is not defined',
      'error',
    );
  });

  it('logs error when evaluation promise rejects', async () => {
    mockEvaluateVat.mockRejectedValueOnce(new Error('Network error'));
    render(<VatRepl />);

    await userEvent.selectOptions(screen.getByTestId('vat-selector'), 'v1');
    await userEvent.type(screen.getByTestId('code-input'), '1 + 1');
    await userEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    await waitFor(() => {
      expect(mockLogMessage).toHaveBeenCalledWith(
        'Failed to evaluate: Network error',
        'error',
      );
    });
  });

  it('renders empty vat list when no status', () => {
    vi.mocked(usePanelContext).mockReturnValue({
      ...mockPanelContext,
      status: undefined,
    });
    render(<VatRepl />);
    const selector = screen.getByTestId('vat-selector');
    // Only the disabled placeholder option
    expect(selector.querySelectorAll('option')).toHaveLength(1);
  });
});
