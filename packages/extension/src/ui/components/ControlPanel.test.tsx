import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ControlPanel } from './ControlPanel.tsx';
import { KernelControls } from './KernelControls.tsx';
import { LaunchSubcluster } from './LaunchSubcluster.tsx';
import { LaunchVat } from './LaunchVat.tsx';
import { SubclustersTable } from './SubclustersTable.tsx';

vi.mock('./KernelControls.tsx', () => ({
  KernelControls: vi.fn(() => <div data-testid="kernel-controls" />),
}));

vi.mock('./LaunchVat.tsx', () => ({
  LaunchVat: vi.fn(() => <div data-testid="launch-vat" />),
}));

vi.mock('./LaunchSubcluster.tsx', () => ({
  LaunchSubcluster: vi.fn(() => <div data-testid="launch-subcluster" />),
}));

vi.mock('./SubclustersTable.tsx', () => ({
  SubclustersTable: vi.fn(() => <div data-testid="subclusters-table" />),
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
    vi.clearAllMocks();
  });

  it('renders the component title', () => {
    render(<ControlPanel />);
    expect(screen.getByText('Kernel')).toBeInTheDocument();
  });

  it('renders all child components in correct order', () => {
    render(<ControlPanel />);

    const children = screen.getAllByTestId(
      /-controls|-table|-vat|-subcluster$/u,
    );
    expect(children).toHaveLength(4);
    expect(children[0]).toHaveAttribute('data-testid', 'kernel-controls');
    expect(children[1]).toHaveAttribute('data-testid', 'subclusters-table');
    expect(children[2]).toHaveAttribute('data-testid', 'launch-vat');
    expect(children[3]).toHaveAttribute('data-testid', 'launch-subcluster');
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

  it('renders SubclustersTable component', () => {
    render(<ControlPanel />);
    expect(SubclustersTable).toHaveBeenCalled();
  });

  it('renders LaunchVat component', () => {
    render(<ControlPanel />);
    expect(LaunchVat).toHaveBeenCalled();
  });

  it('renders LaunchSubcluster component', () => {
    render(<ControlPanel />);
    expect(LaunchSubcluster).toHaveBeenCalled();
  });
});
