import { makePromiseKit } from '@endo/promise-kit';

/**
 * Wrap a promise with a timeout rejection.
 *
 * @param promise - The promise to wrap with a timeout.
 * @param timeout - How many ms to wait before rejecting.
 * @returns A wrapped promise which rejects after timeout miliseconds.
 */
export async function withTimeout<Return>(
  promise: Promise<Return>,
  timeout: number,
): Promise<Return> {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`promise timed out after ${timeout}ms`, {
              cause: promise,
            }),
          ),
        timeout,
      ),
    ),
  ]) as Promise<Return>;
}

/**
 * Make a promise which resolves after a timeout and a reset method which resets the timeout.
 *
 * @param timeout How many ms to wait before the timeout completes.
 * @returns A reset method and a promise which resolves timeout ms after the last reset call.
 */
export function makeTimeoutWithReset(timeout: number): {
  reset: () => void;
  promise: Promise<void>;
} {
  const { promise, resolve } = makePromiseKit<void>();
  let timeoutId = setTimeout(() => resolve(), timeout);
  const reset = (): void => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => resolve(), timeout);
  };
  return {
    promise,
    reset,
  };
}
