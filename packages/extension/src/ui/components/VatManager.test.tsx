import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ConfigEditor } from './ConfigEditor.jsx';
import { KernelControls } from './KernelControls.jsx';
import { LaunchVat } from './LaunchVat.jsx';
import { VatManager } from './VatManager.jsx';
import { VatTable } from './VatTable.jsx';

vi.mock('../../kernel-integration/messages.js', () => ({
  KernelControlMethod: {
    sendMessage: 'sendMessage',
    terminateAllVats: 'terminateAllVats',
    clearState: 'clearState',
    reload: 'reload',
    launchVat: 'launchVat',
  },
}));

vi.mock('../context/PanelContext.js', () => ({
  usePanelContext: vi.fn(() => ({
    status: {
      clusterConfig: {
        test: 'config',
      },
    },
  })),
}));

// Mock the child components
vi.mock('./KernelControls.jsx', () => ({
  KernelControls: vi.fn(() => <div data-testid="kernel-controls" />),
}));

vi.mock('./LaunchVat.jsx', () => ({
  LaunchVat: vi.fn(() => <div data-testid="launch-vat" />),
}));

vi.mock('./VatTable.jsx', () => ({
  VatTable: vi.fn(() => <div data-testid="vat-table" />),
}));

vi.mock('./ConfigEditor.jsx', () => ({
  ConfigEditor: vi.fn(() => <div data-testid="config-editor" />),
}));

vi.mock('../App.module.css', () => ({
  default: {
    headerSection: 'header-section',
  },
}));

describe('VatManager Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders the component title', () => {
    render(<VatManager />);
    expect(screen.getByText('Kernel Vats')).toBeInTheDocument();
  });

  it('renders all child components in correct order', () => {
    render(<VatManager />);

    const children = screen.getAllByTestId(/-controls|-table|-vat|-editor$/u);
    expect(children).toHaveLength(4);
    expect(children[0]).toHaveAttribute('data-testid', 'kernel-controls');
    expect(children[1]).toHaveAttribute('data-testid', 'vat-table');
    expect(children[2]).toHaveAttribute('data-testid', 'launch-vat');
    expect(children[3]).toHaveAttribute('data-testid', 'config-editor');
  });

  it('renders header section with correct class', () => {
    render(<VatManager />);
    const headerSection = screen.getByText('Kernel Vats').parentElement;
    expect(headerSection).toHaveClass('header-section');
  });

  it('renders KernelControls component', () => {
    render(<VatManager />);
    expect(KernelControls).toHaveBeenCalled();
  });

  it('renders VatTable component', () => {
    render(<VatManager />);
    expect(VatTable).toHaveBeenCalled();
  });

  it('renders LaunchVat component', () => {
    render(<VatManager />);
    expect(LaunchVat).toHaveBeenCalled();
  });

  it('renders ConfigEditor component', () => {
    render(<VatManager />);
    expect(ConfigEditor).toHaveBeenCalled();
  });
});
