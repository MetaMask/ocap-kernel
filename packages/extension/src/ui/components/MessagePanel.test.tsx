import { setupOcapKernelMock } from '@ocap/test-utils';
import { stringify } from '@ocap/utils';
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

vi.mock('@ocap/utils', () => ({
  stringify: vi.fn(),
}));

describe('MessagePanel Component', () => {
  const clearLogs = vi.fn();
  const sendKernelCommand = vi.fn();
  const setMessageContent = vi.fn();

  beforeEach(() => {
    cleanup();
    vi.mocked(useKernelActions).mockReturnValue({
      sendKernelCommand,
      terminateAllVats: vi.fn(),
      clearState: vi.fn(),
      reload: vi.fn(),
      launchVat: vi.fn(),
      updateClusterConfig: vi.fn(),
    });
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
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
    expect(
      screen.getByPlaceholderText('Enter message (as JSON)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('calls clearLogs when the "Clear" button is clicked', async () => {
    const { MessagePanel } = await import('./MessagePanel.tsx');
    render(<MessagePanel />);
    const clearButton = screen.getByRole('button', { name: 'Clear' });
    await userEvent.click(clearButton);
    expect(clearLogs).toHaveBeenCalledTimes(1);
  });

  it('calls sendKernelCommand when "Send" button is clicked', async () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '{"key": "value"}',
      setMessageContent,
      panelLogs: [],
      clearLogs,
    } as unknown as PanelContextType);
    const { MessagePanel } = await import('./MessagePanel.tsx');
    render(<MessagePanel />);
    const sendButton = screen.getByRole('button', { name: 'Send' });
    await userEvent.click(sendButton);
    expect(sendKernelCommand).toHaveBeenCalledTimes(1);
  });

  it('calls sendKernelCommand when enter key is pressed', async () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '{"key": "value"}',
      setMessageContent,
      panelLogs: [],
      clearLogs,
    } as unknown as PanelContextType);
    const { MessagePanel } = await import('./MessagePanel.tsx');
    render(<MessagePanel />);
    const inputField = screen.getByPlaceholderText('Enter message (as JSON)');
    await userEvent.click(inputField);
    await userEvent.keyboard('{Enter}');
    expect(sendKernelCommand).toHaveBeenCalledTimes(1);
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

  it('updates messageContent state when typing in the input field', async () => {
    const { MessagePanel } = await import('./MessagePanel.tsx');
    render(<MessagePanel />);
    const inputField = screen.getByPlaceholderText('Enter message (as JSON)');
    await userEvent.type(inputField, 'T');
    expect(setMessageContent).toHaveBeenLastCalledWith('T');
  });

  it('scrolls to bottom when panel logs change', async () => {
    vi.mocked(usePanelContext).mockReturnValue({
      messageContent: '',
      setMessageContent,
      panelLogs: [],
      clearLogs,
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
    } as unknown as PanelContextType);
    rerender(<MessagePanel />);
    expect(scrollWrapper.scrollTop).toBe(scrollWrapper.scrollHeight);
  });
});
