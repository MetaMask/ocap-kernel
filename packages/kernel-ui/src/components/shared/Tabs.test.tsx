import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Tabs } from './Tabs.tsx';

describe('Tabs Component', () => {
  const mockTabs = [
    { label: 'Tab 1', value: 'tab1' },
    { label: 'Tab 2', value: 'tab2' },
    { label: 'Tab 3', value: 'tab3' },
  ];

  const mockOnTabChange = vi.fn();

  beforeEach(() => {
    cleanup();
  });

  it('renders all provided tabs', () => {
    render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={mockOnTabChange} />,
    );

    mockTabs.forEach((tab) => {
      expect(
        screen.getByRole('button', { name: tab.label }),
      ).toBeInTheDocument();
    });
  });

  it('applies correct CSS classes to tab buttons', () => {
    render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={mockOnTabChange} />,
    );

    const tabButtons = screen.getAllByRole('button');
    tabButtons.forEach((button) => {
      expect(button).toHaveClass('tabButton');
    });

    const activeButton = screen.getByRole('button', { name: 'Tab 1' });
    expect(activeButton).toHaveClass('activeTab');
  });

  it('applies active class only to the selected tab', () => {
    render(
      <Tabs tabs={mockTabs} activeTab="tab2" onTabChange={mockOnTabChange} />,
    );

    const activeButton = screen.getByRole('button', { name: 'Tab 2' });
    expect(activeButton).toHaveClass('activeTab');

    const inactiveButtons = [
      screen.getByRole('button', { name: 'Tab 1' }),
      screen.getByRole('button', { name: 'Tab 3' }),
    ];
    inactiveButtons.forEach((button) => {
      expect(button).not.toHaveClass('activeTab');
    });
  });

  it('calls onTabChange with correct value when tab is clicked', async () => {
    render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={mockOnTabChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Tab 2' }));
    expect(mockOnTabChange).toHaveBeenCalledWith('tab2');

    await userEvent.click(screen.getByRole('button', { name: 'Tab 3' }));
    expect(mockOnTabChange).toHaveBeenCalledWith('tab3');
  });

  it('renders tabs container with correct class', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={mockOnTabChange} />,
    );

    expect(container.firstChild).toHaveClass('tabButtons');
  });
});
