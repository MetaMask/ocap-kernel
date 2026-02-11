import { stringify } from '@metamask/kernel-utils';
import { setupOcapKernelMock } from '@ocap/repo-tools/test-utils';
import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MessagePanel } from './MessagePanel.tsx';
import { usePanelContext } from '../context/PanelContext.tsx';
import type { PanelContextType, OutputType } from '../context/PanelContext.tsx';
import { useKernelActions } from '../hooks/useKernelActions.ts';

setupOcapKernelMock();

// Mock the hooks
vi.mock('../hooks/useKernelActions.ts', () => ({
  useKernelActions: vi.fn(),
}));

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

vi.mock('@metamask/kernel-utils', () => ({
  stringify: vi.fn(),
}));

// Mock the LoadingDots component
vi.mock('./shared/LoadingDots.tsx', () => ({
  LoadingDots: () => <div data-testid="loading-dots">Loading...</div>,
}));

describe('MessagePanel Component', () => {
  const clearLogs = vi.fn();
  const setMessageContent = vi.fn();

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(useKernelActions).mockReturnValue({
      terminateAllVats: vi.fn(),
      collectGarbage: vi.fn(),
      clearState: vi.fn(),
      launchSubcluster: vi.fn(),
    });
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
      isLoading: false,
      callKernelMethod: vi.fn(),
      status: undefined,
      logMessage: vi.fn(),
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
    } as unknown as PanelContextType);
    vi.mocked(stringify).mockImplementation((message) =>
      JSON.stringify(message),
    );
  });

  it('renders initial UI elements correctly', () => {
    render(<MessagePanel />);
    expect(screen.getByText('Message History')).toBeInTheDocument();
    // Clear button should not be present when there are no logs
    expect(screen.queryByTestId('clear-logs-button')).not.toBeInTheDocument();
  });

  it('calls clearLogs when the "Clear" button is clicked', async () => {
    // Set up context with logs so the clear button appears
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [{ type: 'sent', message: 'Test message' }],
      clearLogs,
      isLoading: false,
      callKernelMethod: vi.fn(),
      status: undefined,
      logMessage: vi.fn(),
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
    } as unknown as PanelContextType);

    render(<MessagePanel />);
    const clearButton = screen.getByTestId('clear-logs-button');
    await userEvent.click(clearButton);
    expect(clearLogs).toHaveBeenCalledTimes(1);
  });

  it('renders panel logs with correct icons and messages', () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [
        { type: 'sent', message: 'Message 1' },
        { type: 'received', message: 'Message 2' },
        { type: 'error', message: 'Error occurred' },
        { type: 'success', message: 'Operation successful' },
      ],
      clearLogs,
      isLoading: false,
      callKernelMethod: vi.fn(),
      status: undefined,
      logMessage: vi.fn(),
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
    } as unknown as PanelContextType);
    render(<MessagePanel />);
    expect(screen.getByText('→')).toBeInTheDocument();
    expect(screen.getByText('Message 1')).toBeInTheDocument();
    expect(screen.getByText('←')).toBeInTheDocument();
    expect(screen.getByText('Message 2')).toBeInTheDocument();
    expect(screen.getByText('⚠')).toBeInTheDocument();
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('Operation successful')).toBeInTheDocument();
  });

  it('handles unknown output types with default styling', () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [
        { type: 'unknown' as OutputType, message: 'Unknown type message' },
      ],
      clearLogs,
      isLoading: false,
      callKernelMethod: vi.fn(),
      status: undefined,
      logMessage: vi.fn(),
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
    } as unknown as PanelContextType);
    render(<MessagePanel />);
    expect(screen.getByText('→')).toBeInTheDocument(); // Default icon for unknown type
    expect(screen.getByText('Unknown type message')).toBeInTheDocument();
  });

  it('scrolls to bottom when panel logs change', () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
      isLoading: false,
      callKernelMethod: vi.fn(),
      status: undefined,
      logMessage: vi.fn(),
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
    } as unknown as PanelContextType);
    const { rerender } = render(<MessagePanel />);
    const scrollWrapper = screen.getByRole('log');
    Object.defineProperty(scrollWrapper, 'scrollHeight', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(scrollWrapper, 'scrollTop', {
      configurable: true,
      value: 0,
      writable: true,
    });
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [{ type: 'sent', message: 'New message' }],
      clearLogs,
      isLoading: false,
      callKernelMethod: vi.fn(),
      status: undefined,
      logMessage: vi.fn(),
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
    } as unknown as PanelContextType);
    rerender(<MessagePanel />);
    expect(scrollWrapper.scrollTop).toBe(scrollWrapper.scrollHeight);
  });

  it('displays loading dots when isLoading is true', () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
      isLoading: true,
      callKernelMethod: vi.fn(),
      status: undefined,
      logMessage: vi.fn(),
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
    } as unknown as PanelContextType);
    render(<MessagePanel />);
    expect(screen.getByTestId('loading-dots')).toBeInTheDocument();
  });

  it('does not display loading dots when isLoading is false', () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
      isLoading: false,
      callKernelMethod: vi.fn(),
      status: undefined,
      logMessage: vi.fn(),
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
    } as unknown as PanelContextType);
    render(<MessagePanel />);
    expect(screen.queryByTestId('loading-dots')).not.toBeInTheDocument();
  });

  it('does not show clear button when there are no logs', () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
      isLoading: false,
      callKernelMethod: vi.fn(),
      status: undefined,
      logMessage: vi.fn(),
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
    } as unknown as PanelContextType);
    render(<MessagePanel />);
    expect(screen.queryByTestId('clear-logs-button')).not.toBeInTheDocument();
  });

  it('shows clear button when there are logs', () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [{ type: 'sent', message: 'Test message' }],
      clearLogs,
      isLoading: false,
      callKernelMethod: vi.fn(),
      status: undefined,
      logMessage: vi.fn(),
      objectRegistry: null,
      setObjectRegistry: vi.fn(),
    } as unknown as PanelContextType);
    render(<MessagePanel />);
    expect(screen.getByTestId('clear-logs-button')).toBeInTheDocument();
  });
});
