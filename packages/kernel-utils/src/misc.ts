import { AbortError } from '@metamask/kernel-errors';

// Re-export makeCounter for backward compatibility
export { makeCounter } from './counter.ts';

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
    }
  });
}
