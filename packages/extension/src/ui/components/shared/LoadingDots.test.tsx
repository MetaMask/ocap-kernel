import { render, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { LoadingDots } from './LoadingDots.tsx';

describe('LoadingDots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders initial loading state with single dot', () => {
    const { getByText } = render(<LoadingDots />);
    expect(getByText('Loading.')).toBeInTheDocument();
  });

  it('animates dots correctly over time', () => {
    const { container } = render(<LoadingDots />);
    const getLoadingText = (): string => container.textContent ?? '';
    expect(getLoadingText()).toBe('Loading.');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(getLoadingText()).toBe('Loading..');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(getLoadingText()).toBe('Loading...');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(getLoadingText()).toBe('Loading.');
  });

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = render(<LoadingDots />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
