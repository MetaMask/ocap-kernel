import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ConfigEditor } from './ConfigEditor.js';
import type { KernelStatus } from '../../kernel-integration/messages.js';
import clusterConfig from '../../vats/default-cluster.json';
import { usePanelContext } from '../context/PanelContext.js';
import { useKernelActions } from '../hooks/useKernelActions.js';

const mockStatus = {
  clusterConfig,
  vats: [],
};

const mockLogMessage = vi.fn();

const mockUsePanelContext = {
  status: mockStatus,
  logMessage: mockLogMessage,
  messageContent: '',
  setMessageContent: vi.fn(),
  panelLogs: [],
  clearLogs: vi.fn(),
  sendMessage: vi.fn(),
  selectedVatId: '1',
  setSelectedVatId: vi.fn(),
};

vi.mock('../hooks/useKernelActions.js', () => ({
  useKernelActions: vi.fn(),
}));

vi.mock('../context/PanelContext.js', () => ({
  usePanelContext: vi.fn(),
}));

// Mock the CSS module
vi.mock('../App.module.css', () => ({
  default: {
    configEditor: 'config-editor',
    configTextarea: 'config-textarea',
    configEditorButtons: 'config-editor-buttons',
    buttonPrimary: 'button-primary',
    buttonBlack: 'button-black',
  },
}));

describe('ConfigEditor Component', () => {
  const mockUpdateClusterConfig = vi.fn();
  const mockReload = vi.fn();

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(useKernelActions).mockReturnValue({
      updateClusterConfig: mockUpdateClusterConfig,
      reload: mockReload,
      sendKernelCommand: vi.fn(),
      terminateAllVats: vi.fn(),
      clearState: vi.fn(),
      launchVat: vi.fn(),
    });
    vi.mocked(usePanelContext).mockReturnValue(mockUsePanelContext);
  });

  it('renders nothing when status is not available', () => {
    vi.mocked(usePanelContext).mockReturnValue({
      ...mockUsePanelContext,
      status: undefined,
    });
    const { container } = render(<ConfigEditor />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the config editor with initial config', () => {
    render(<ConfigEditor />);
    expect(screen.getByText('Cluster Config')).toBeInTheDocument();
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue(
      JSON.stringify(mockStatus.clusterConfig, null, 2),
    );
    expect(
      screen.getByRole('button', { name: 'Update Config' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Update and Restart' }),
    ).toBeInTheDocument();
  });

  it('updates textarea value when user types', async () => {
    render(<ConfigEditor />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'test' } });
    expect(textarea).toHaveValue('test');
  });

  it('updates config when "Update Config" is clicked', async () => {
    mockUpdateClusterConfig.mockResolvedValue(undefined);
    render(<ConfigEditor />);
    const updateButton = screen.getByTestId('update-config');
    await userEvent.click(updateButton);
    expect(mockUpdateClusterConfig).toHaveBeenCalledWith(
      mockStatus.clusterConfig,
    );
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('updates config and reloads when "Update and Restart" is clicked', async () => {
    mockUpdateClusterConfig.mockResolvedValue(undefined);
    render(<ConfigEditor />);
    const updateButton = screen.getByTestId('update-and-restart');
    await userEvent.click(updateButton);
    expect(mockUpdateClusterConfig).toHaveBeenCalledWith(
      mockStatus.clusterConfig,
    );
    expect(mockReload).toHaveBeenCalled();
  });

  it('logs error when invalid JSON is submitted', async () => {
    mockUpdateClusterConfig.mockRejectedValueOnce(new Error('Invalid JSON'));
    render(<ConfigEditor />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'test' } });
    const updateButton = screen.getByTestId('update-config');
    await userEvent.click(updateButton);
    expect(mockLogMessage).toHaveBeenCalledWith(
      `SyntaxError: Unexpected token 'e', "test" is not valid JSON`,
      'error',
    );
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('logs error when update fails', async () => {
    const error = new Error('Update failed');
    mockUpdateClusterConfig.mockRejectedValueOnce(error);
    render(<ConfigEditor />);
    await userEvent.click(screen.getByTestId('update-config'));

    await waitFor(() => {
      expect(mockLogMessage).toHaveBeenCalledWith(error.toString(), 'error');
    });
  });

  it('updates textarea when status changes', async () => {
    const { rerender } = render(<ConfigEditor />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue(
      JSON.stringify(mockStatus.clusterConfig, null, 2),
    );

    const newStatus: KernelStatus = {
      clusterConfig: {
        ...clusterConfig,
        bootstrap: 'updated-config',
      },
      vats: [],
    };

    vi.mocked(usePanelContext).mockReturnValue({
      ...mockUsePanelContext,
      status: newStatus,
    });

    rerender(<ConfigEditor />);

    await waitFor(() => {
      expect(textarea).toHaveValue(
        JSON.stringify(newStatus.clusterConfig, null, 2),
      );
    });
  });
});
