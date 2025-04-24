import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ConfigEditor } from './ConfigEditor.tsx';
import { ControlPanel } from './ControlPanel.tsx';
import { KernelControls } from './KernelControls.tsx';
import { LaunchVat } from './LaunchVat.tsx';
import { VatTable } from './VatTable.tsx';

vi.mock('../context/PanelContext.tsx', () => ({
  usePanelContext: vi.fn(() => ({
    status: {
      clusterConfig: {
        test: 'config',
      },
    },
  })),
}));

// Mock the child components
vi.mock('./KernelControls.tsx', () => ({
  KernelControls: vi.fn(() => <div data-testid="kernel-controls" />),
}));

vi.mock('./LaunchVat.tsx', () => ({
  LaunchVat: vi.fn(() => <div data-testid="launch-vat" />),
}));

vi.mock('./VatTable.tsx', () => ({
  VatTable: vi.fn(() => <div data-testid="vat-table" />),
}));

vi.mock('./ConfigEditor.tsx', () => ({
  ConfigEditor: vi.fn(() => <div data-testid="config-editor" />),
}));

vi.mock('../App.module.css', () => ({
  default: {
    headerSection: 'header-section',
    noMargin: 'no-margin',
  },
}));

describe('ControlPanel Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders the component title', () => {
    render(<ControlPanel />);
    expect(screen.getByText('Kernel')).toBeInTheDocument();
  });

  it('renders all child components in correct order', () => {
    render(<ControlPanel />);

    const children = screen.getAllByTestId(/-controls|-table|-vat|-editor$/u);
    expect(children).toHaveLength(4);
    expect(children[0]).toHaveAttribute('data-testid', 'kernel-controls');
    expect(children[1]).toHaveAttribute('data-testid', 'config-editor');
    expect(children[2]).toHaveAttribute('data-testid', 'vat-table');
    expect(children[3]).toHaveAttribute('data-testid', 'launch-vat');
  });

  it('renders header section with correct class', () => {
    render(<ControlPanel />);
    const headerSection = screen.getByText('Kernel').parentElement;
    expect(headerSection).toHaveClass('header-section');
  });

  it('renders KernelControls component', () => {
    render(<ControlPanel />);
    expect(KernelControls).toHaveBeenCalled();
  });

  it('renders ConfigEditor component', () => {
    render(<ControlPanel />);
    expect(ConfigEditor).toHaveBeenCalled();
  });

  it('renders VatTable component', () => {
    render(<ControlPanel />);
    expect(VatTable).toHaveBeenCalled();
  });

  it('renders LaunchVat component', () => {
    render(<ControlPanel />);
    expect(LaunchVat).toHaveBeenCalled();
  });
});
