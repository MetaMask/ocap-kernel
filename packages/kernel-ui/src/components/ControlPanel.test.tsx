import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ControlPanel } from './ControlPanel.tsx';
import { KernelControls } from './KernelControls.tsx';
import { LaunchSubcluster } from './LaunchSubcluster.tsx';
import { SubclustersTable } from './SubclustersTable.tsx';

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

    const children = screen.getAllByTestId(/-controls|-table|-subcluster$/u);
    expect(children).toHaveLength(3);
    expect(children[0]).toHaveAttribute('data-testid', 'kernel-controls');
    expect(children[1]).toHaveAttribute('data-testid', 'subclusters-table');
    expect(children[2]).toHaveAttribute('data-testid', 'launch-subcluster');
  });

  it('renders header section', () => {
    render(<ControlPanel />);
    const headerSection = screen.getByText('Kernel').parentElement;
    expect(headerSection).toBeInTheDocument();
  });

  it('renders KernelControls component', () => {
    render(<ControlPanel />);
    expect(KernelControls).toHaveBeenCalled();
  });

  it('renders SubclustersTable component', () => {
    render(<ControlPanel />);
    expect(SubclustersTable).toHaveBeenCalled();
  });

  it('renders LaunchSubcluster component', () => {
    render(<ControlPanel />);
    expect(LaunchSubcluster).toHaveBeenCalled();
  });
});
