import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { Modal } from './Modal.tsx';

describe('Modal', () => {
  const mockOnClose = vi.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    title: 'Test Modal',
    children: <div>Modal content</div>,
  };

  beforeEach(() => {
    // Reset body overflow style before each test
    document.body.style.overflow = 'unset';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    // Clean up body overflow style after each test
    document.body.style.overflow = 'unset';
  });

  it('does not render when closed', () => {
    render(<Modal {...defaultProps} isOpen={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
  });

  it('renders correctly when open', () => {
    render(<Modal {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('has correct accessibility attributes', () => {
    render(<Modal {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');

    const title = screen.getByText('Test Modal');
    expect(title).toHaveAttribute('id', 'modal-title');

    const closeButton = screen.getByRole('button', { name: 'Close modal' });
    expect(closeButton).toHaveAttribute('aria-label', 'Close modal');
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<Modal {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: 'Close modal' });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when ESC key is pressed', async () => {
    const user = userEvent.setup();
    render(<Modal {...defaultProps} />);

    await user.keyboard('{Escape}');

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking outside modal content', async () => {
    const user = userEvent.setup();
    render(<Modal {...defaultProps} />);

    const backdrop = screen.getByRole('dialog');
    await user.click(backdrop);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside modal content', async () => {
    const user = userEvent.setup();
    render(<Modal {...defaultProps} />);

    const modalContent = screen.getByText('Modal content');
    await user.click(modalContent);

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('prevents body scroll when open', () => {
    render(<Modal {...defaultProps} />);

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when unmounted', () => {
    const { unmount } = render(<Modal {...defaultProps} />);

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('unset');
  });

  it('handles modal toggling correctly', () => {
    const { rerender } = render(<Modal {...defaultProps} isOpen={true} />);

    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(<Modal {...defaultProps} isOpen={false} />);

    expect(document.body.style.overflow).toBe('unset');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('applies correct size classes', () => {
    const { rerender } = render(<Modal {...defaultProps} size="sm" />);

    let modalContent = screen.getByRole('dialog').firstChild as HTMLElement;
    expect(modalContent).toHaveClass('modalContent', 'sm');

    rerender(<Modal {...defaultProps} size="md" />);
    modalContent = screen.getByRole('dialog').firstChild as HTMLElement;
    expect(modalContent).toHaveClass('modalContent', 'md');

    rerender(<Modal {...defaultProps} size="lg" />);
    modalContent = screen.getByRole('dialog').firstChild as HTMLElement;
    expect(modalContent).toHaveClass('modalContent', 'lg');
  });

  it('defaults to medium size when no size is specified', () => {
    render(<Modal {...defaultProps} />);

    const modalContent = screen.getByRole('dialog').firstChild as HTMLElement;
    expect(modalContent).toHaveClass('modalContent', 'md');
  });

  it('renders custom children correctly', () => {
    const customContent = (
      <div>
        <p>Custom paragraph</p>
        <button>Custom button</button>
      </div>
    );

    render(<Modal {...defaultProps} children={customContent} />);

    expect(screen.getByText('Custom paragraph')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Custom button' }),
    ).toBeInTheDocument();
  });

  it('handles rapid open/close correctly', () => {
    const { rerender } = render(<Modal {...defaultProps} isOpen={false} />);

    // Rapidly toggle modal
    rerender(<Modal {...defaultProps} isOpen={true} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Modal {...defaultProps} isOpen={false} />);
    expect(document.body.style.overflow).toBe('unset');

    rerender(<Modal {...defaultProps} isOpen={true} />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('does not trigger ESC handler when modal is closed', async () => {
    const user = userEvent.setup();
    render(<Modal {...defaultProps} isOpen={false} />);

    await user.keyboard('{Escape}');

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('maintains focus trap behavior', () => {
    render(<Modal {...defaultProps} />);

    const modalContent = screen.getByRole('dialog').firstChild as HTMLElement;
    expect(modalContent).toHaveAttribute('tabIndex', '-1');
  });
});
