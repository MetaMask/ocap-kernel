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
      expect(screen.getByRole('tab', { name: tab.label })).toBeInTheDocument();
    });
  });

  it('applies correct CSS classes to tab buttons', () => {
    render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={mockOnTabChange} />,
    );

    const tabButtons = screen.getAllByRole('tab');
    tabButtons.forEach((button) => {
      expect(button).toHaveClass('p-2', 'mx-2', 'font-medium', 'border-b-2');
    });

    const activeButton = screen.getByRole('tab', { name: 'Tab 1' });
    expect(activeButton).toHaveClass(
      'text-primary-default',
      'border-primary-default',
    );
  });

  it('applies active class only to the selected tab', () => {
    render(
      <Tabs tabs={mockTabs} activeTab="tab2" onTabChange={mockOnTabChange} />,
    );

    const activeButton = screen.getByRole('tab', { name: 'Tab 2' });
    expect(activeButton).toHaveClass(
      'text-primary-default',
      'border-primary-default',
    );

    const inactiveButtons = [
      screen.getByRole('tab', { name: 'Tab 1' }),
      screen.getByRole('tab', { name: 'Tab 3' }),
    ];
    inactiveButtons.forEach((button) => {
      expect(button).toHaveClass('border-transparent', 'text-default');
    });
  });

  it('calls onTabChange with correct value when tab is clicked', async () => {
    render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={mockOnTabChange} />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Tab 2' }));
    expect(mockOnTabChange).toHaveBeenCalledWith('tab2');

    await userEvent.click(screen.getByRole('tab', { name: 'Tab 3' }));
    expect(mockOnTabChange).toHaveBeenCalledWith('tab3');
  });

  it('renders tabs container with correct class', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} activeTab="tab1" onTabChange={mockOnTabChange} />,
    );

    expect(container.firstChild).toHaveClass(
      'flex',
      'overflow-hidden',
      'border-b',
      'border-muted',
    );
  });
});
