import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { Table } from './Table.tsx';

describe('Table Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders table with children', () => {
    render(
      <Table>
        <tbody>
          <tr>
            <td>Test content</td>
          </tr>
        </tbody>
      </Table>,
    );

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(table).toHaveTextContent('Test content');
  });

  it('applies default styling classes', () => {
    render(
      <Table>
        <tbody>
          <tr>
            <td>Content</td>
          </tr>
        </tbody>
      </Table>,
    );

    const table = screen.getByRole('table');
    expect(table).toHaveClass(
      'w-full',
      'border-collapse',
      'border-t',
      'border-muted',
    );
  });

  it('renders with custom data-testid', () => {
    render(
      <Table dataTestid="custom-table">
        <tbody>
          <tr>
            <td>Content</td>
          </tr>
        </tbody>
      </Table>,
    );

    const table = screen.getByTestId('custom-table');
    expect(table).toBeInTheDocument();
  });

  it('renders without data-testid when not provided', () => {
    render(
      <Table>
        <tbody>
          <tr>
            <td>Content</td>
          </tr>
        </tbody>
      </Table>,
    );

    const table = screen.getByRole('table');
    expect(table).not.toHaveAttribute('data-testid');
  });
});
