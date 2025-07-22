import { renderHook } from '@testing-library/react-hooks';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useDarkMode } from './useDarkMode.ts';

describe('useDarkMode', () => {
  let mockAddEventListener: ReturnType<typeof vi.fn>;
  let mockRemoveEventListener: ReturnType<typeof vi.fn>;
  let mockDispatchEvent: ReturnType<typeof vi.fn>;
  let mockClassList: {
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  const createMockMediaQuery = (matches: boolean): MediaQueryList =>
    ({
      matches,
      media: '(prefers-color-scheme: dark)',
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      dispatchEvent: mockDispatchEvent,
      onchange: null,
    }) as unknown as MediaQueryList;

  beforeEach(() => {
    // Reset mocks
    mockAddEventListener = vi.fn();
    mockRemoveEventListener = vi.fn();
    mockDispatchEvent = vi.fn();
    mockClassList = {
      add: vi.fn(),
      remove: vi.fn(),
    };

    // Mock document.documentElement.classList
    Object.defineProperty(document.documentElement, 'classList', {
      writable: true,
      value: mockClassList,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with light mode when system preference is light', () => {
    const lightModeMock = createMockMediaQuery(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(lightModeMock),
    });

    renderHook(() => useDarkMode());

    expect(mockClassList.remove).toHaveBeenCalledWith('dark');
    expect(mockClassList.add).not.toHaveBeenCalled();
  });

  it('should initialize with dark mode when system preference is dark', () => {
    const darkModeMock = createMockMediaQuery(true);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(darkModeMock),
    });

    renderHook(() => useDarkMode());

    expect(mockClassList.add).toHaveBeenCalledWith('dark');
    expect(mockClassList.remove).not.toHaveBeenCalled();
  });

  it('should add event listener for media query changes', () => {
    const mock = createMockMediaQuery(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(mock),
    });

    renderHook(() => useDarkMode());

    expect(mockAddEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('should handle media query change to dark mode', () => {
    const mock = createMockMediaQuery(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(mock),
    });

    const { rerender } = renderHook(() => useDarkMode());

    // Simulate media query change to dark mode
    const changeHandler = mockAddEventListener.mock.calls[0]?.[1];
    expect(changeHandler).toBeDefined();

    const mockEvent = {
      matches: true,
    } as MediaQueryListEvent;

    changeHandler(mockEvent);

    // Re-render to trigger useEffect
    rerender();

    expect(mockClassList.add).toHaveBeenCalledWith('dark');
    expect(mockClassList.remove).toHaveBeenCalledWith('dark');
  });

  it('should handle media query change to light mode', () => {
    const mock = createMockMediaQuery(true);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(mock),
    });

    const { rerender } = renderHook(() => useDarkMode());

    // Simulate media query change to light mode
    const changeHandler = mockAddEventListener.mock.calls[0]?.[1];
    expect(changeHandler).toBeDefined();

    const mockEvent = {
      matches: false,
    } as MediaQueryListEvent;

    changeHandler(mockEvent);

    // Re-render to trigger useEffect
    rerender();

    expect(mockClassList.remove).toHaveBeenCalledWith('dark');
    expect(mockClassList.add).toHaveBeenCalledWith('dark');
  });

  it('should remove event listener on cleanup', () => {
    const mock = createMockMediaQuery(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(mock),
    });

    const { unmount } = renderHook(() => useDarkMode());

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('should call matchMedia with correct query', () => {
    const mock = createMockMediaQuery(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(mock),
    });

    renderHook(() => useDarkMode());

    expect(window.matchMedia).toHaveBeenCalledWith(
      '(prefers-color-scheme: dark)',
    );
  });

  it('should handle multiple state changes correctly', () => {
    const mock = createMockMediaQuery(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue(mock),
    });

    const { rerender } = renderHook(() => useDarkMode());

    // Initial state - light mode
    expect(mockClassList.remove).toHaveBeenCalledWith('dark');

    // Change to dark mode
    const changeHandler = mockAddEventListener.mock.calls[0]?.[1];
    expect(changeHandler).toBeDefined();

    changeHandler({ matches: true } as MediaQueryListEvent);
    rerender();

    // Change back to light mode
    changeHandler({ matches: false } as MediaQueryListEvent);
    rerender();

    // Verify the calls
    expect(mockClassList.remove).toHaveBeenCalledTimes(2);
    expect(mockClassList.add).toHaveBeenCalledTimes(1);
  });
});
