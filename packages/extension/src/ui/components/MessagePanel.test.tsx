import { define } from '@metamask/superstruct';
import type { VatConfig, VatId } from '@ocap/kernel';
import { stringify } from '@ocap/utils';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { usePanelContext } from '../context/PanelContext.js';
import type { PanelContextType } from '../context/PanelContext.js';
import { useKernelActions } from '../hooks/useKernelActions.js';

const isVatId = vi.fn(
  (input: unknown): input is VatId => typeof input === 'string',
);

const isVatConfig = vi.fn(
  (input: unknown): input is VatConfig => typeof input === 'object',
);

vi.mock('@ocap/kernel', () => ({
  isVatId,
  isVatConfig,
  VatCommandMethod: {
    ping: 'ping',
    evaluate: 'evaluate',
  },
  KernelCommandMethod: {
    kvSet: 'kvSet',
    kvGet: 'kvGet',
  },
  VatIdStruct: define<VatId>('VatId', isVatId),
  VatConfigStruct: define<VatConfig>('VatConfig', isVatConfig),
}));

vi.mock('../hooks/useKernelActions.js', () => ({
  useKernelActions: vi.fn(),
}));

vi.mock('../context/PanelContext.js', () => ({
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
    const { MessagePanel } = await import('./MessagePanel.js');
    render(<MessagePanel />);
    expect(screen.getByText('Message History')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Enter message (as JSON)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('calls clearLogs when the "Clear" button is clicked', async () => {
    const { MessagePanel } = await import('./MessagePanel.js');
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
    const { MessagePanel } = await import('./MessagePanel.js');
    render(<MessagePanel />);
    const sendButton = screen.getByRole('button', { name: 'Send' });
    await userEvent.click(sendButton);
    expect(sendKernelCommand).toHaveBeenCalledTimes(1);
  });

  it('populates input field when a template button is clicked', async () => {
    const { MessagePanel } = await import('./MessagePanel.js');
    render(<MessagePanel />);
    const templateButton = screen.getByRole('button', { name: 'KVSet' });
    await userEvent.click(templateButton);
    expect(setMessageContent).toHaveBeenCalledWith(
      stringify({ method: 'kvSet', params: { key: 'foo', value: 'bar' } }, 0),
    );
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
    const { MessagePanel } = await import('./MessagePanel.js');
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
    const { MessagePanel } = await import('./MessagePanel.js');
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
    const { MessagePanel } = await import('./MessagePanel.js');
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
