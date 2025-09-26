import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { Input } from './Input.tsx';

describe('Input', () => {
  it('should render an input element', () => {
    render(<Input />);
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('should pass through props to the input element', () => {
    render(
      <Input
        data-testid="test-input"
        placeholder="Test placeholder"
        value="Test value"
        readOnly
      />,
    );

    const input = screen.getByTestId('test-input');
    expect(input).toHaveAttribute('placeholder', 'Test placeholder');
    expect(input).toHaveValue('Test value');
    expect(input).toHaveAttribute('readonly');
  });

  it('should apply the correct CSS classes', () => {
    render(<Input data-testid="styled-input" />);
    const input = screen.getByTestId('styled-input');

    expect(input).toHaveClass(
      'flex',
      'items-center',
      'h-9',
      'px-3',
      'rounded',
      'border',
      'border-border-default',
      'text-sm',
      'bg-background-default',
      'text-text-default',
      'transition-colors',
      'hover:bg-background-hover',
      'focus:outline-none',
      'focus:ring-2',
      'focus:ring-primary-default',
      'flex-1',
    );
  });

  it('should accept custom style prop', () => {
    render(
      <Input
        data-testid="custom-style-input"
        style={{ width: '100%', fontSize: '16px' }}
      />,
    );

    const input = screen.getByTestId('custom-style-input');
    expect(input).toHaveStyle({ width: '100%', fontSize: '16px' });
  });

  it('should handle input events', () => {
    const handleChange = vi.fn();
    render(<Input data-testid="event-input" onChange={handleChange} />);

    const input = screen.getByTestId('event-input');
    fireEvent.change(input, { target: { value: 'new value' } });

    expect(handleChange).toHaveBeenCalled();
  });

  it('should be focusable', () => {
    render(<Input data-testid="focusable-input" />);
    const input = screen.getByTestId('focusable-input');

    input.focus();
    expect(input).toHaveFocus();
  });
});
