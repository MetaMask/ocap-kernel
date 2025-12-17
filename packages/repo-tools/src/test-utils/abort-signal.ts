import { vi } from 'vitest';

/**
 * Create a mock AbortSignal that can be manually aborted.
 *
 * This utility was created because Vitest cannot mock `AbortSignal.timeout()`.
 * Vitest relies on @sinonjs/fake-timers for timer mocking, but fake-timers does
 * not implement the AbortSignal.timeout API, so we cannot use Vitest's timer
 * mocking to test timeout behavior. This mock allows us to manually trigger
 * abort events in tests to simulate timeout scenarios.
 * https://github.com/vitest-dev/vitest/issues/3088
 *
 * @param timeoutMs - The timeout value (stored for verification).
 * @returns A mock AbortSignal.
 */
export function makeAbortSignalMock(timeoutMs: number): AbortSignal & {
  abort: () => void;
  timeoutMs: number;
} {
  const handlers: (() => void)[] = [];
  let aborted = false;

  const signal = {
    get aborted() {
      return aborted;
    },
    timeoutMs,
    addEventListener: vi.fn((event: string, handler: () => void) => {
      if (event === 'abort') {
        handlers.push(handler);
      }
    }),
    removeEventListener: vi.fn((event: string, handler: () => void) => {
      if (event === 'abort') {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    }),
    dispatchEvent: vi.fn(),
    onabort: null,
    reason: undefined,
    throwIfAborted: vi.fn(),
    abort() {
      aborted = true;
      // Call all handlers synchronously
      for (const handler of handlers) {
        handler();
      }
    },
  } as AbortSignal & {
    abort: () => void;
    timeoutMs: number;
  };

  return signal;
}
