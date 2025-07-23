import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ControlPanel } from './ControlPanel.tsx';

// Mock the child components
vi.mock('./KernelControls.tsx', () => ({
  KernelControls: () => (
    <div data-testid="kernel-controls">Kernel Controls</div>
  ),
}));

vi.mock('./SubclustersTable.tsx', () => ({
  SubclustersTable: () => (
    <div data-testid="subclusters-table">Subclusters Table</div>
  ),
}));

vi.mock('./LaunchSubcluster.tsx', () => ({
  LaunchSubcluster: () => (
    <div data-testid="launch-subcluster">Launch Subcluster</div>
  ),
}));

describe('ControlPanel Component', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders all child components in correct order', () => {
    render(<ControlPanel />);

    const kernelControls = screen.getByTestId('kernel-controls');
    const subclustersTable = screen.getByTestId('subclusters-table');
    const launchSubcluster = screen.getByTestId('launch-subcluster');

    expect(kernelControls).toBeInTheDocument();
    expect(subclustersTable).toBeInTheDocument();
    expect(launchSubcluster).toBeInTheDocument();

    // Check that they appear in the correct order in the DOM
    const container = screen.getByTestId('kernel-controls').parentElement;
    const children = Array.from(container?.children ?? []);

    expect(children[0]).toHaveAttribute('data-testid', 'kernel-controls');
    expect(children[1]).toHaveAttribute('data-testid', 'subclusters-table');
    expect(children[2]).toHaveAttribute('data-testid', 'launch-subcluster');
  });

  it('renders KernelControls component', () => {
    render(<ControlPanel />);
    expect(screen.getByTestId('kernel-controls')).toBeInTheDocument();
  });

  it('renders SubclustersTable component', () => {
    render(<ControlPanel />);
    expect(screen.getByTestId('subclusters-table')).toBeInTheDocument();
  });

  it('renders LaunchSubcluster component', () => {
    render(<ControlPanel />);
    expect(screen.getByTestId('launch-subcluster')).toBeInTheDocument();
  });
});
