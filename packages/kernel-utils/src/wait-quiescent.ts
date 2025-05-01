import 'setimmediate';
import { makePromiseKit } from '@endo/promise-kit';

// Note: This can only be imported from the Start Compartment, where the tricks
// used by the 'setimmediate' package are available.

/**
 * Return a promise that waits until the microtask queue is empty. When this
 * promise resolves, the holder can be assured that the environment no longer
 * has agency.
 *
 * @param delay - Optional delay (in ms) to wait for things to catch up.
 *
 * @returns a Promise that can await the compartment becoming quiescent.
 */
export async function waitUntilQuiescent(delay: number = 0): Promise<void> {
  // the delivery might cause some number of (native) Promises to be
  // created and resolved, so we use the IO queue to detect when the
  // Promise queue is empty. The IO queue (setImmediate and setTimeout) is
  // lower-priority than the Promise queue on browsers.
  const { promise: queueEmptyP, resolve } = makePromiseKit<void>();
  if (delay > 0) {
    setTimeout(() => resolve(), delay);
  } else {
    setImmediate(() => resolve());
  }
  return queueEmptyP;
}
