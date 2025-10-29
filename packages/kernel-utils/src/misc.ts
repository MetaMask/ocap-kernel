import { AbortError } from '@metamask/kernel-errors';

/**
 * A simple counter which increments and returns when called.
 *
 * @param start - One less than the first returned number.
 * @returns A counter.
 */
export const makeCounter = (start: number = 0) => {
  let counter: number = start;
  return () => {
    counter += 1;
    return counter;
  };
};

/**
 * Delay execution by the specified number of milliseconds.
 *
 * @param ms - The number of milliseconds to delay.
 * @returns A promise that resolves after the specified delay.
 */
export const delay = async (ms = 1): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Abortable sleep.
 *
 * @param ms - The number of milliseconds to sleep.
 * @param signal - The abort signal to listen to.
 * @returns A promise that resolves when the sleep is complete.
 */
export async function abortableDelay(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  if (ms <= 0) {
    return;
  }
  if (signal?.aborted) {
    throw new AbortError();
  }
  await new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    const onAbort = (): void => {
      clearTimeout(id);
      reject(new AbortError());
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
      // Check again after adding listener to catch aborts that occurred during registration
      if (signal.aborted) {
        clearTimeout(id);
        signal.removeEventListener('abort', onAbort);
        reject(new AbortError());
      }
    }
  });
}
