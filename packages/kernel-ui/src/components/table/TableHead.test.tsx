import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { TableHead } from './TableHead.tsx';

describe('TableHead Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders table head with children', () => {
    render(
      <TableHead>
        <th>Header 1</th>
        <th>Header 2</th>
      </TableHead>,
    );

    const tableHead = screen.getByRole('rowgroup');
    expect(tableHead).toBeInTheDocument();
    expect(tableHead).toHaveTextContent('Header 1');
    expect(tableHead).toHaveTextContent('Header 2');
  });

  it('applies default styling classes to the row', () => {
    render(
      <TableHead>
        <th>Header</th>
      </TableHead>,
    );

    const row = screen.getByRole('row');
    expect(row).toHaveClass('border-b', 'border-muted');
  });

  it('renders with single header', () => {
    render(
      <TableHead>
        <th>Single Header</th>
      </TableHead>,
    );

    const tableHead = screen.getByRole('rowgroup');
    const row = screen.getByRole('row');
    const header = screen.getByRole('columnheader');

    expect(tableHead).toBeInTheDocument();
    expect(row).toBeInTheDocument();
    expect(header).toBeInTheDocument();
    expect(header).toHaveTextContent('Single Header');
  });

  it('renders with multiple headers', () => {
    render(
      <TableHead>
        <th>First</th>
        <th>Second</th>
        <th>Third</th>
      </TableHead>,
    );

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[0]).toHaveTextContent('First');
    expect(headers[1]).toHaveTextContent('Second');
    expect(headers[2]).toHaveTextContent('Third');
  });

  it('renders with complex header content', () => {
    render(
      <TableHead>
        <th>
          <span data-testid="complex-header">Complex Header</span>
        </th>
      </TableHead>,
    );

    const tableHead = screen.getByRole('rowgroup');
    const complexHeader = screen.getByTestId('complex-header');

    expect(tableHead).toBeInTheDocument();
    expect(complexHeader).toBeInTheDocument();
    expect(complexHeader).toHaveTextContent('Complex Header');
  });
});
