import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { TableCell } from './TableCell.tsx';

describe('TableCell Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders table cell with children', () => {
    render(<TableCell>Test content</TableCell>);

    const cell = screen.getByRole('cell');
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveTextContent('Test content');
  });

  it('applies default styling classes', () => {
    render(<TableCell>Content</TableCell>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('py-1', 'px-3');
  });

  it('applies first column styling when first prop is true', () => {
    render(<TableCell first>Content</TableCell>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('py-1', 'px-3', 'border-r', 'border-muted');
  });

  it('does not apply first column styling when first prop is false', () => {
    render(<TableCell first={false}>Content</TableCell>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('py-1', 'px-3');
    expect(cell).not.toHaveClass('border-r', 'border-muted');
  });

  it('does not apply first column styling when first prop is undefined', () => {
    render(<TableCell>Content</TableCell>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('py-1', 'px-3');
    expect(cell).not.toHaveClass('border-r', 'border-muted');
  });

  it('renders with complex children', () => {
    render(
      <TableCell>
        <span data-testid="complex-child">Complex content</span>
      </TableCell>,
    );

    const cell = screen.getByRole('cell');
    const complexChild = screen.getByTestId('complex-child');

    expect(cell).toBeInTheDocument();
    expect(complexChild).toBeInTheDocument();
    expect(complexChild).toHaveTextContent('Complex content');
  });
});
