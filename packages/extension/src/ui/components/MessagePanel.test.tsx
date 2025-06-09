import { stringify } from '@metamask/kernel-utils';
import { setupOcapKernelMock } from '@ocap/test-utils';
import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { usePanelContext } from '../context/PanelContext.tsx';
import type { PanelContextType } from '../context/PanelContext.tsx';
import { useKernelActions } from '../hooks/useKernelActions.ts';

setupOcapKernelMock();

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
    vi.mocked(useKernelActions).mockReturnValue({
      terminateAllVats: vi.fn(),
      collectGarbage: vi.fn(),
      clearState: vi.fn(),
      reload: vi.fn(),
      launchSubcluster: vi.fn(),
    });
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
      isLoading: false,
    } as unknown as PanelContextType);
    vi.mocked(stringify).mockImplementation((message) =>
      JSON.stringify(message),
    );
  });

  it('renders initial UI elements correctly', async () => {
    const { MessagePanel } = await import('./MessagePanel.tsx');
    render(<MessagePanel />);
    expect(screen.getByText('Message History')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('calls clearLogs when the "Clear" button is clicked', async () => {
    const { MessagePanel } = await import('./MessagePanel.tsx');
    render(<MessagePanel />);
    const clearButton = screen.getByRole('button', { name: 'Clear' });
    await userEvent.click(clearButton);
    expect(clearLogs).toHaveBeenCalledTimes(1);
  });

  it('renders panel logs with correct icons and messages', async () => {
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
    } as unknown as PanelContextType);
    const { MessagePanel } = await import('./MessagePanel.tsx');
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

  it('scrolls to bottom when panel logs change', async () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
      isLoading: false,
    } as unknown as PanelContextType);
    const { MessagePanel } = await import('./MessagePanel.tsx');
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
    } as unknown as PanelContextType);
    rerender(<MessagePanel />);
    expect(scrollWrapper.scrollTop).toBe(scrollWrapper.scrollHeight);
  });

  it('displays loading dots when isLoading is true', async () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
      isLoading: true,
    } as unknown as PanelContextType);
    const { MessagePanel } = await import('./MessagePanel.tsx');
    render(<MessagePanel />);
    expect(screen.getByTestId('loading-dots')).toBeInTheDocument();
  });

  it('does not display loading dots when isLoading is false', async () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
      isLoading: false,
    } as unknown as PanelContextType);
    const { MessagePanel } = await import('./MessagePanel.tsx');
    render(<MessagePanel />);
    expect(screen.queryByTestId('loading-dots')).not.toBeInTheDocument();
  });
});
