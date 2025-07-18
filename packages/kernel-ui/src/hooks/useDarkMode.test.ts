import { renderHook } from '@testing-library/react-hooks';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useDarkMode } from './useDarkMode.ts';

describe('useDarkMode', () => {
  let mockMediaQuery: MediaQueryList;
  let mockAddEventListener: ReturnType<typeof vi.fn>;
  let mockRemoveEventListener: ReturnType<typeof vi.fn>;
  let mockDispatchEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock MediaQueryList
    mockAddEventListener = vi.fn();
    mockRemoveEventListener = vi.fn();
    mockDispatchEvent = vi.fn();

    mockMediaQuery = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      dispatchEvent: mockDispatchEvent,
      onchange: null,
    } as unknown as MediaQueryList;

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(mockMediaQuery),
    });

    // Mock document.documentElement.classList
    const mockClassList = {
      add: vi.fn(),
      remove: vi.fn(),
    };
    Object.defineProperty(document.documentElement, 'classList', {
      writable: true,
      value: mockClassList,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with light mode when system preference is light', () => {
    mockMediaQuery.matches = false;

    renderHook(() => useDarkMode());

    expect(document.documentElement.classList.remove).toHaveBeenCalledWith(
      'dark',
    );
    expect(document.documentElement.classList.add).not.toHaveBeenCalled();
  });

  it('should initialize with dark mode when system preference is dark', () => {
    mockMediaQuery.matches = true;

    renderHook(() => useDarkMode());

    expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
    expect(document.documentElement.classList.remove).not.toHaveBeenCalled();
  });

  it('should add event listener for media query changes', () => {
    renderHook(() => useDarkMode());

    expect(mockAddEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('should dispatch change event to ensure initial state is set', () => {
    renderHook(() => useDarkMode());

    expect(mockDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'change',
        matches: true,
      }),
    );
  });

  it('should handle media query change to dark mode', () => {
    mockMediaQuery.matches = false;

    const { rerender } = renderHook(() => useDarkMode());

    // Simulate media query change to dark mode
    const changeHandler = mockAddEventListener.mock.calls[0][1];
    const mockEvent = {
      matches: true,
    } as MediaQueryListEvent;

    changeHandler(mockEvent);

    // Re-render to trigger useEffect
    rerender();

    expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
    expect(document.documentElement.classList.remove).toHaveBeenCalledWith(
      'dark',
    );
  });

  it('should handle media query change to light mode', () => {
    mockMediaQuery.matches = true;

    const { rerender } = renderHook(() => useDarkMode());

    // Simulate media query change to light mode
    const changeHandler = mockAddEventListener.mock.calls[0][1];
    const mockEvent = {
      matches: false,
    } as MediaQueryListEvent;

    changeHandler(mockEvent);

    // Re-render to trigger useEffect
    rerender();

    expect(document.documentElement.classList.remove).toHaveBeenCalledWith(
      'dark',
    );
    expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
  });

  it('should remove event listener on cleanup', () => {
    const { unmount } = renderHook(() => useDarkMode());

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('should call matchMedia with correct query', () => {
    renderHook(() => useDarkMode());

    expect(window.matchMedia).toHaveBeenCalledWith(
      '(prefers-color-scheme: dark)',
    );
  });

  it('should handle multiple state changes correctly', () => {
    mockMediaQuery.matches = false;

    const { rerender } = renderHook(() => useDarkMode());

    // Initial state - light mode
    expect(document.documentElement.classList.remove).toHaveBeenCalledWith(
      'dark',
    );

    // Change to dark mode
    const changeHandler = mockAddEventListener.mock.calls[0][1];
    changeHandler({ matches: true } as MediaQueryListEvent);
    rerender();

    // Change back to light mode
    changeHandler({ matches: false } as MediaQueryListEvent);
    rerender();

    // Verify the calls
    expect(document.documentElement.classList.remove).toHaveBeenCalledTimes(2);
    expect(document.documentElement.classList.add).toHaveBeenCalledTimes(1);
  });
});
