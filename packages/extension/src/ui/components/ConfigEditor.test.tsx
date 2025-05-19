import type { KernelStatus } from '@metamask/ocap-kernel';
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ConfigEditor } from './ConfigEditor.tsx';
import defaultClusterConfig from '../../vats/default-cluster.json';
import minimalClusterConfig from '../../vats/minimal-cluster.json';
import { usePanelContext } from '../context/PanelContext.tsx';
import { useKernelActions } from '../hooks/useKernelActions.ts';

const mockStatus = {
  clusterConfig: defaultClusterConfig,
  vats: [],
};

const mockLogMessage = vi.fn();

const mockUsePanelContext = {
  callKernelMethod: vi.fn(),
  clearLogs: vi.fn(),
  isLoading: false,
  logMessage: mockLogMessage,
  messageContent: '',
  panelLogs: [],
  selectedVatId: '1',
  setMessageContent: vi.fn(),
  setSelectedVatId: vi.fn(),
  status: mockStatus,
  objectRegistry: null,
  setObjectRegistry: vi.fn(),
};

vi.mock('../hooks/useKernelActions.ts', () => ({
  useKernelActions: vi.fn(),
}));

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(),
}));

// Mock the CSS module
vi.mock('../App.module.css', () => ({
  default: {
    accordion: 'accordion',
    accordionHeader: 'accordion-header',
    accordionTitle: 'accordion-title',
    accordionIndicator: 'accordion-indicator',
    accordionContent: 'accordion-content',
    configTextarea: 'config-textarea',
    configControls: 'config-controls',
    select: 'select',
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
      terminateAllVats: vi.fn(),
      clearState: vi.fn(),
      launchVat: vi.fn(),
      collectGarbage: vi.fn(),
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

  it('renders the config editor with initial config', async () => {
    render(<ConfigEditor />);
    expect(screen.getByText('Cluster Config')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('config-title'));
    const textarea = screen.getByTestId('config-textarea');
    expect(textarea).toHaveValue(
      JSON.stringify(mockStatus.clusterConfig, null, 2),
    );
    expect(
      screen.getByRole('button', { name: 'Update Config' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Update and Reload' }),
    ).toBeInTheDocument();
  });

  it('updates textarea value when user types', async () => {
    render(<ConfigEditor />);
    await userEvent.click(screen.getByTestId('config-title'));
    const textarea = screen.getByTestId('config-textarea');
    fireEvent.change(textarea, { target: { value: 'test' } });
    expect(textarea).toHaveValue('test');
  });

  it('updates config when "Update Config" is clicked', async () => {
    mockUpdateClusterConfig.mockResolvedValue(undefined);
    render(<ConfigEditor />);
    await userEvent.click(screen.getByTestId('config-title'));
    const updateButton = screen.getByTestId('update-config');
    await userEvent.click(updateButton);
    expect(mockUpdateClusterConfig).toHaveBeenCalledWith(
      mockStatus.clusterConfig,
    );
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('updates config and reloads when "Update and Reload" is clicked', async () => {
    mockUpdateClusterConfig.mockResolvedValue(undefined);
    render(<ConfigEditor />);
    await userEvent.click(screen.getByTestId('config-title'));
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
    await userEvent.click(screen.getByTestId('config-title'));
    const textarea = screen.getByTestId('config-textarea');
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
    await userEvent.click(screen.getByTestId('config-title'));
    await userEvent.click(screen.getByTestId('update-config'));

    await waitFor(() => {
      expect(mockLogMessage).toHaveBeenCalledWith(error.toString(), 'error');
    });
  });

  it('updates textarea when status changes', async () => {
    const { rerender } = render(<ConfigEditor />);
    await userEvent.click(screen.getByTestId('config-title'));
    const textarea = screen.getByTestId('config-textarea');
    expect(textarea).toHaveValue(
      JSON.stringify(mockStatus.clusterConfig, null, 2),
    );

    const newStatus: KernelStatus = {
      clusterConfig: {
        ...defaultClusterConfig,
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

  it('renders the config template selector with default option selected', async () => {
    render(<ConfigEditor />);
    await userEvent.click(screen.getByTestId('config-title'));
    const selector = screen.getByTestId('config-select');
    expect(selector).toBeInTheDocument();
    expect(selector).toHaveValue('Default');
  });

  it('updates textarea when selecting a different template', async () => {
    render(<ConfigEditor />);
    await userEvent.click(screen.getByTestId('config-title'));
    const selector = screen.getByTestId('config-select');
    const textarea = screen.getByTestId('config-textarea');
    expect(textarea).toHaveValue(JSON.stringify(defaultClusterConfig, null, 2));
    await userEvent.selectOptions(selector, 'Minimal');
    expect(textarea).toHaveValue(JSON.stringify(minimalClusterConfig, null, 2));
  });
});
