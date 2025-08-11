import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { TableValue } from './TableValue.tsx';

describe('TableValue Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders table value with children', () => {
    render(<TableValue>Test value</TableValue>);

    const cell = screen.getByRole('cell');
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveTextContent('Test value');
  });

  it('applies default styling classes', () => {
    render(<TableValue>Value</TableValue>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('py-1', 'px-3');
  });

  it('applies first column styling when first prop is true', () => {
    render(<TableValue first>Value</TableValue>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('py-1', 'px-3', 'border-r', 'border-muted');
  });

  it('does not apply first column styling when first prop is false', () => {
    render(<TableValue first={false}>Value</TableValue>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('py-1', 'px-3');
    expect(cell).not.toHaveClass('border-r', 'border-muted');
  });

  it('does not apply first column styling when first prop is undefined', () => {
    render(<TableValue>Value</TableValue>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('py-1', 'px-3');
    expect(cell).not.toHaveClass('border-r', 'border-muted');
  });

  it('renders with complex children', () => {
    render(
      <TableValue>
        <span data-testid="complex-value">Complex value</span>
      </TableValue>,
    );

    const cell = screen.getByRole('cell');
    const complexValue = screen.getByTestId('complex-value');

    expect(cell).toBeInTheDocument();
    expect(complexValue).toBeInTheDocument();
    expect(complexValue).toHaveTextContent('Complex value');
  });

  it('renders with numeric children', () => {
    render(<TableValue>42</TableValue>);

    const cell = screen.getByRole('cell');
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveTextContent('42');
  });

  it('renders with null children', () => {
    render(<TableValue>{null}</TableValue>);

    const cell = screen.getByRole('cell');
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveTextContent('');
  });
});
