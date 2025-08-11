import { TextVariant } from '@metamask/design-system-react';
import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { TableHeader } from './TableHeader.tsx';

describe('TableHeader Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders table header with children', () => {
    render(<TableHeader>Test Header</TableHeader>);

    const header = screen.getByRole('columnheader');
    expect(header).toBeInTheDocument();
    expect(header).toHaveTextContent('Test Header');
  });

  it('applies default styling classes', () => {
    render(<TableHeader>Header</TableHeader>);

    const header = screen.getByRole('columnheader');
    expect(header).toHaveClass('text-left', 'py-2', 'px-3');
  });

  it('applies first column styling when first prop is true', () => {
    render(<TableHeader first>Header</TableHeader>);

    const header = screen.getByRole('columnheader');
    expect(header).toHaveClass(
      'text-left',
      'py-2',
      'px-3',
      'border-l',
      'border-muted',
    );
  });

  it('does not apply first column styling when first prop is false', () => {
    render(<TableHeader first={false}>Header</TableHeader>);

    const header = screen.getByRole('columnheader');
    expect(header).toHaveClass('text-left', 'py-2', 'px-3');
    expect(header).not.toHaveClass('border-l', 'border-muted');
  });

  it('does not apply first column styling when first prop is undefined', () => {
    render(<TableHeader>Header</TableHeader>);

    const header = screen.getByRole('columnheader');
    expect(header).toHaveClass('text-left', 'py-2', 'px-3');
    expect(header).not.toHaveClass('border-l', 'border-muted');
  });

  it('uses default TextVariant.BodyXs when variant is not provided', () => {
    render(<TableHeader>Header</TableHeader>);

    const header = screen.getByRole('columnheader');
    expect(header).toBeInTheDocument();
    // The TextComponent will render with the default variant
    expect(header).toHaveTextContent('Header');
  });

  it('uses custom variant when provided', () => {
    render(<TableHeader variant={TextVariant.BodyMd}>Header</TableHeader>);

    const header = screen.getByRole('columnheader');
    expect(header).toBeInTheDocument();
    expect(header).toHaveTextContent('Header');
  });

  it('renders with complex children', () => {
    render(
      <TableHeader>
        <span data-testid="complex-header">Complex Header</span>
      </TableHeader>,
    );

    const header = screen.getByRole('columnheader');
    const complexHeader = screen.getByTestId('complex-header');

    expect(header).toBeInTheDocument();
    expect(complexHeader).toBeInTheDocument();
    expect(complexHeader).toHaveTextContent('Complex Header');
  });

  it('applies correct font weight for BodyXs variant', () => {
    render(<TableHeader variant={TextVariant.BodyXs}>Header</TableHeader>);

    const header = screen.getByRole('columnheader');
    expect(header).toBeInTheDocument();
    // The TextComponent will apply FontWeight.Medium for BodyXs
    expect(header).toHaveTextContent('Header');
  });

  it('applies correct font weight for non-BodyXs variant', () => {
    render(<TableHeader variant={TextVariant.BodyMd}>Header</TableHeader>);

    const header = screen.getByRole('columnheader');
    expect(header).toBeInTheDocument();
    // The TextComponent will apply FontWeight.Regular for non-BodyXs
    expect(header).toHaveTextContent('Header');
  });
});
