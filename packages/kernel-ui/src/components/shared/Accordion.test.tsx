import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { Accordion } from './Accordion.tsx';

describe('Accordion', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders with title and collapsed content by default', () => {
    render(
      <Accordion title="Test Title">
        <div>Test Content</div>
      </Accordion>,
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('add')).toBeInTheDocument();
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  });

  it('expands and shows content when clicked (uncontrolled)', async () => {
    const user = userEvent.setup();
    render(
      <Accordion title="Test Title">
        <div>Test Content</div>
      </Accordion>,
    );

    // Initially collapsed
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
    expect(screen.getByText('add')).toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText('Test Title'));

    // Should now be expanded
    expect(screen.getByText('Test Content')).toBeInTheDocument();
    expect(screen.getByText('minus')).toBeInTheDocument();

    // Click to collapse
    await user.click(screen.getByText('Test Title'));

    // Should be collapsed again
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
    expect(screen.getByText('add')).toBeInTheDocument();
  });

  it('works in controlled mode with external state', async () => {
    const user = userEvent.setup();
    const mockOnToggle = vi.fn();

    render(
      <Accordion title="Test Title" isExpanded={true} onToggle={mockOnToggle}>
        <div>Test Content</div>
      </Accordion>,
    );

    // Should be expanded because isExpanded=true
    expect(screen.getByText('Test Content')).toBeInTheDocument();
    expect(screen.getByText('minus')).toBeInTheDocument();

    // Click should call onToggle
    await user.click(screen.getByText('Test Title'));
    expect(mockOnToggle).toHaveBeenCalledWith(false);
  });

  it('accepts complex JSX as title', () => {
    render(
      <Accordion
        title={
          <span>
            Complex <strong>Title</strong> with <em>formatting</em>
          </span>
        }
      >
        <div>Test Content</div>
      </Accordion>,
    );

    // Check for the individual text nodes within their respective elements
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('formatting')).toBeInTheDocument();

    // Check that the span element exists
    const spanElement = screen.getByText('Title').closest('span');
    expect(spanElement).toHaveTextContent('Complex Title with formatting');
  });

  it('applies custom test ID when provided', () => {
    render(
      <Accordion title="Test Title" testId="custom-accordion">
        <div>Test Content</div>
      </Accordion>,
    );

    expect(screen.getByTestId('custom-accordion')).toBeInTheDocument();
  });

  it('handles controlled mode with initial false state', () => {
    const mockOnToggle = vi.fn();

    render(
      <Accordion title="Test Title" isExpanded={false} onToggle={mockOnToggle}>
        <div>Test Content</div>
      </Accordion>,
    );

    // Should be collapsed because isExpanded=false
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
    expect(screen.getByText('add')).toBeInTheDocument();
  });
});
